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
//   AI_IP_LIMIT          选填，单 IP 每日上限，默认 1000（10/6 由 200 上调：这道闸在会员判断之前，
//                          站长本人也受限；20 人规模下 200 不够）
//   AI_USER_WEEKLY_LIMIT 选填，免费账号每周轻量 AI 兜底额度，默认 5。
//                        11-15 最终口径：免费写作批改每月 3 篇；口语模考与高耗 AI 会员专属；
//                        会员轻量 AI 不设次数，写作批改不设次数，重活逐项独立额度。
//                        （原 AI_USER_DAILY_LIMIT=10 每日兜底口径已退役。）
//   AI_FREE_MOCK_MONTHLY 已退役：口语模考不再给免费次数，整场模考仅会员可用。
//   AI_FREE_WRITING_TOTAL 选填，免费写作批改次数/自然月，默认 3（配 0 回到会员专属）
//   AI_RATE_PER_MIN      选填，单账号每分钟调用上限（防脚本刷量），默认 10；会员同样受限
// 访问规则（她 10/1 拍板「必须登录才能用 AI」）：登录闸先于一切——未登录（无/无效 X-Session）
// 一律 401 auth_required，即使 AI_API_KEY 未配也不给未登录用户探出任何信息。
// 未配 AI_API_KEY 时（已登录用户）返回 501 { ok:false, error:'relay_not_configured' }。
// 会员跳过免费轻量额度闸；重活按下面的 QUOTA_LIMITS 逐项独立计数，7 天卡按四分之一配额。
//
// 为什么只透传白名单字段：请求体由浏览器提供，若整段转发上游，任何人都能借本站 Key
// 调任意参数（甚至换 model 打贵模型）。因此只取 model/messages/temperature/max_tokens/
// response_format，其余一律忽略。
//
// 限流实现说明：计数落在 SYNC_KV，键按「天 + 10 个轮转桶」打散，避开 KV「同一 key 每秒 1 次写」
// 的限制。当前流量（每日几十~几百次）完全够用；真到每天上万次请换 D1 / Durable Objects。
//
// 计量键清单（admin 面板 /api/admin overview 聚合这些键）：
//   aiq:<day>:<bucket>            全站今日总量（10 桶轮转，TTL 48h）
//   aiqip:<ip>:<day>:<bucket>     单 IP 今日（TTL 48h）
//   aiqa:<acct>:<day>:<bucket>    按账号今日（TTL 48h）—— 面板「今日 AI 次数」
//   aiqw:<acct>:<YYYY-Www>        免费账号周兜底计数（TTL 10 天）
//   aiqmo:<acct>:<YYYY-MM>        ⛔ 退役：旧免费模考月键，不再读写
//   aiqmo:<acct>:<YYYY-MM>:writing 免费写作批改月额度（TTL 40 天）
//   aiqv2:<acct>:<group>:<period> 会员重活周期额度（TTL 40 天）
//   aiqtask:<acct>:<group>:<period>:<token> 会员重活任务接力牌（TTL 40 天）
//   aiqt:<acct>:writing           ⛔ 10-25 W-FREE-2 起不再读写（旧的终身写作计数，已废，别再用）
//   aiqm:<acct>:<day>:<HHMM>      分钟风控（TTL 2 分钟自愈）
//   aiqwv:<acct>:<YYYY-Www>       ⛔ 10/20 深夜起**不再写入**（面板已改用 aistat: 累加近 7 天，
//                                 全仓无读方）；存量旧键 TTL 到期自然消失，别再加回来。
//   aiqmv:<acct>:<YYYY-MM>        面板「本月 AI 次数」（TTL 400 天，自然月 UTC，只写一次）

/* 10/10 CORS 收紧（保密性加固 P0）：
   优先用显式配置 AI_ALLOW_ORIGIN；否则用 onRequest 里算好的同源判定：
     · 同源（Origin 的 host == 请求 host）→ 回显该 Origin；
     · 异源 → 置 'null'（浏览器直接拒绝，拦住「别的网站借用户浏览器调本站 AI」）；
     · 无 Origin（curl / 服务端脚本）→ 回 '*'，但这类请求**本来就不受 CORS 约束**，
       所以那道闸（防盗刷额度）交给 Cloudflare Edge 的 Rate Limiting，不在这里假装能挡。
       ⚠️ 浏览器请求会带 X-Session / X-Ai-Task，预检白名单必须放行；成功响应要暴露 X-Ai-Task。 */
import { readSession } from './auth.js';

function corsHeaders(env) {
  return {
    'access-control-allow-origin': (env && env.__allowOrigin) || (env && env.AI_ALLOW_ORIGIN) || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Session, X-Ai-Task',
    'access-control-expose-headers': 'X-Ai-Task',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const MAX_INPUT_CHARS = 60000;      // messages 序列化后的字符上限，防超大请求拖爆上游
const UPSTREAM_TIMEOUT_MS = 55000;  // Pages Function 上限 60s（免费版 CPU/墙钟），留 5s 余量
const DAY_MS = 86400000;
const PERMANENT_VIP_EXPIRE = 9999999999999;
const QUOTA_TTL = 3456000;
const QUOTA_LIMITS = {
  mock_exam: { limit: 10, period: 'week', label: '口语模考' },
  chuan: { limit: 5, period: 'month', label: '串题' },
  material: { limit: 5, period: 'month', label: '整套素材生成' },
  remap: { limit: 5, period: 'month', label: '换季重映射' },
  studyplan: { limit: 5, period: 'month', label: '完整备考计划' },
  diagpro: { limit: 5, period: 'month', label: '深度诊断' },
};
const SERVICE_PRIORITY = {
  p3_followup: 5,
  writing_score: 10,
  material_plan: 20,
  material: 20,
  material_persona: 20,
  material_fixen: 20,
  material_remap: 20,
  speaking_chuan_plan: 20,
  speaking_chuan_final: 20,
  studyplan: 20,
  diagpro: 20,
  mock_q: 20,
  mock_score: 20,
  mock_summary: 20,
};
const SERVICE_RULES = {
  diag: { max: 4096 },
  rebalance: { max: 1500 },
  daily: { max: 4096 },
  weekly: { max: 4096 },
  words: { max: 256 },
  longsent: { max: 4096 },
  translate: { max: 4096 },
  trans: { max: 4096 },
  dictation_check: { max: 4096 },
  errorbook: { max: 4096 },
  gpt: { max: 4000 },
  pattern_judge: { max: 150 },
  sentence_check: { max: 600 },
  speaking_aihelper: { max: 4096 },
  speaking_coach: { max: 1400 },
  speaking_diagnose: { max: 4096 },
  p3_aihelper: { max: 4096 },
  p3_review: { max: 4096 },
  p3_followup: { max: 4096 },
  writing_hint: { max: 4096 },
  writing_bank: { max: 4096 },
  writing_score: { max: 8192 },
  mock_q: { max: 4096, quota: 'mock_exam' },
  mock_score: { max: 4096, quota: 'mock_exam' },
  mock_summary: { max: 4096 },
  speaking_chuan_plan: { max: 4096, quota: 'chuan' },
  speaking_chuan_final: { max: 4096, quota: 'chuan' },
  /* 出问卷是整套素材的前置步骤，只验额度不扣次数：否则一次完整流程会吃掉 2 次，
     与「整套素材生成每月 5 次」的口径不符。 */
  material_plan: { max: 8192, quota: 'material', gateOnly: true },
  material: { max: 8192, quota: 'material' },
  material_persona: { max: 4096, quota: 'material' },
  material_fixen: { max: 4096, quota: 'material' },
  material_remap: { max: 8192, quota: 'remap' },
  studyplan: { max: 4000, quota: 'studyplan' },
  diagpro: { max: 3000, quota: 'diagpro' },
};

function quotaSuffix(period, now) {
  return period === 'week' ? isoWeekKey(now) : monthKey(now);
}

function quotaKey(acct, group, period, now) {
  return 'aiqv2:' + acct + ':' + group + ':' + quotaSuffix(period, now);
}

function quotaTaskPrefixKey(acct, group, period, now) {
  return 'aiqtask:' + acct + ':' + group + ':' + quotaSuffix(period, now) + ':';
}

function shortPlanQuota(vip, now) {
  if (!vip || !vip.expire || vip.expire >= PERMANENT_VIP_EXPIRE) return false;
  /* fullUntil = 已付费的全额配额期结束点。过了这个点还没到期，说明只剩短卡尾巴 → 1/4。
     老记录没有 fullUntil 时退回档位判断（30/90 天档仍按全额，不误伤最后一周）。 */
  const fullUntil = Number(vip.fullUntil || 0);
  if (fullUntil > 0) return (now || Date.now()) >= fullUntil;
  const planDays = vipTierDays(vip);
  if (planDays > 0) return planDays <= 7;
  if (vip.plan === 'week' || vip.plan === '7d') return true;
  if (vip.plan === 'month' || vip.plan === 'quarter' || vip.plan === 'permanent') return false;
  /* 没有可靠档位信息时放行：宁可让老会员多用，也不把续费中的老用户误降成 1/4。 */
  return false;
}

/* 档位只记“买过的最大档”，不能拿总到期天数推：7 天卡续两次仍是 7 天档。 */
function vipTierDays(vip) {
  if (!vip || typeof vip !== 'object') return 0;
  const explicit = Number(vip.planDays || vip.grantedDays || 0);
  if (explicit > 0) return explicit;
  const plan = String(vip.plan || '').toLowerCase();
  if (plan === 'week' || plan === '7d') return 7;
  if (plan === 'month' || plan === '30d') return 30;
  if (plan === 'quarter' || plan === '90d') return 90;
  if (plan === 'permanent') return 3650;
  if (vip.grantedAt && vip.expire && vip.expire > vip.grantedAt) {
    const inferredDays = Math.round((vip.expire - vip.grantedAt) / DAY_MS);
    if (inferredDays > 0 && inferredDays <= 14) return 7;
    if (inferredDays >= 29 && inferredDays <= 92) return inferredDays <= 31 ? 30 : 90;
  }
  return 0;
}

function limitOf(group, vip) {
  const def = QUOTA_LIMITS[group];
  if (!vip.quarter) return def.limit;
  return Math.max(1, Math.floor(def.limit / 4));
}

function quotaMessage(group, vip) {
  const def = QUOTA_LIMITS[group];
  const total = limitOf(group, vip);
  if (def.period === 'week') return `${def.label}这周跑满 ${total} 场啦，先让 AI 喝口水，下周满血回来`;
  return `${def.label}这个月跑满 ${total} 次啦，先让 AI 喝口水，下月再接着忙`;
}

function readNumber(kv, key) {
  return kv.get(key).then(v => parseInt(v || '0', 10) || 0).catch(() => 0);
}

function makeTaskToken() {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '');
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = c.getRandomValues(new Uint8Array(12));
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function validTaskToken(token) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(token);
}

function normalizeService(rawService, clean) {
  const known = Object.prototype.hasOwnProperty.call(SERVICE_RULES, rawService);
  if (!known) return { service: rawService, valid: false };
  const sys = clean.filter(m => m.role === 'system').map(m => String(m.content || '')).join('\n');
  const text = sys.slice(0, 12000);
  let detected = null;
  if (/\[STATION_TASK:mock_exam\]/.test(text)) detected = 'mock_q';
  else if (/你是雅思写作考官|官方评分原话短语表/.test(text)) detected = 'writing_score';
  else if (/生成从今天到考试日的完整每日任务计划/.test(text)) detected = 'studyplan';
  else if (/你是一位雅思写作与口语主讲老师/.test(text)) detected = 'diagpro';
  else if (/你是雅思口语 P2 串题规划师|你是雅思口语 P2 串题成稿助手|从这段雅思口语 P2 讲稿提取/.test(text)) detected = 'speaking_chuan_final';
  else if (/你是雅思口语串题覆盖挖掘助手/.test(text)) detected = 'material_remap';
  else if (/你是雅思口语素材规划师/.test(text)) detected = 'material_plan';
  else if (/你是雅思口语人设分析师/.test(text)) detected = 'material_persona';
  else if (/你是英语润色助手/.test(text)) detected = 'material_fixen';
  else if (/你是雅思口语「串题素材」整理教练|【P2 题库对照清单】/.test(text)) detected = 'material';
  else if (/You are an IELTS Speaking Part 3 follow-up question generator/.test(text)) detected = 'p3_followup';
  else if (/You are an IELTS speaking examiner/.test(text)) detected = 'mock_score';
  else if (/You are an IELTS speaking error analyst/.test(text)) detected = 'mock_summary';
  if (!detected) return { service: rawService, valid: true };
  const rawPriority = SERVICE_PRIORITY[rawService] || 0;
  const detectedPriority = SERVICE_PRIORITY[detected] || 0;
  const service = detectedPriority > rawPriority ? detected : rawService;
  return { service: service, valid: true, corrected: service !== rawService };
}

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

/* 自然月键（UTC）：写作批改与重活月额度按自然月清零，键里带月份故 TTL 只防残留。 */
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

export async function onRequest(context) {
  const { request } = context;
  /* 10/10 同源校验：没显式配 AI_ALLOW_ORIGIN 时，按「Origin 的 host 是否等于请求 host」判定，
     结果挂在 env.__allowOrigin 上供 corsHeaders 读取（这样不用改 20 多个 json() 调用点）。
     ⚠️ Object.assign 造副本而不是改 context.env —— CF 的 env 不该被就地污染。 */
  const env = Object.assign({}, context.env);
  if (!env.AI_ALLOW_ORIGIN) {
    try {
      const o = request.headers.get('Origin') || '';
      if (o) {
        const h = request.headers.get('host') || '';
        env.__allowOrigin = (h && new URL(o).host === h) ? o : 'null';
      }
    } catch (e) { env.__allowOrigin = 'null'; }
  }

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
  const sess = await readSession(env.SYNC_KV, request);
  const acct = sess ? sess.acct : null;
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

  // service 先白名单 + 提示词指纹校正：防浏览器把重活改名成便宜功能绕开额度。
  const rawService = String((body && body.service) || '').trim();
  const resolved = normalizeService(rawService, clean);
  if (!resolved.valid) {
    return json({ ok: false, error: 'bad_service', msg: '这个 AI 功能没有登记，刷新页面再试一次吧' }, 400, env);
  }
  const service = resolved.service;
  const rule = SERVICE_RULES[service];

  /* ---- 配额：全站每日 + 单 IP 每日 ---- */
  const now = new Date();
  const day = dayKey(now);
  const bucket = bucketOf(now);
  const dailyLimit = parseInt((env && env.AI_DAILY_LIMIT) || '3000', 10) || 3000;
  /* 10/6 12:25 她拍板「IP 上限现在就调高」：200 → 1000。
     为什么必须调：这道闸写在**「算你是不是会员」之前** → **连永久会员（她自己）也照样被限**。
     10/6 她就因为「我跑探针把 200 次吃满」而当天没法用 AI（探针和她共用同一个 IP）。
     1000 的依据：20 个用户就算全在同一个网络、每人 50 次/天，也才 1000；
     单 IP 一天 1000 次 ≈ 300 万 token ≈ ¥6-10，作为「防小号刷子」的兜底成本仍可接受
     （真正拦住刷子的是「注册要手机号」+「账号级每周 5 次」，不是这道 IP 闸）。
     ⚠️ 想在 Cloudflare 后台随时改：配环境变量 `AI_IP_LIMIT` 即可覆盖这里的默认值。
     ⚠️ 改了上限**不等于**可以放开跑真调 AI 的探针 —— 探针的默认跳过闸（ALLOW_LIVE_AI）必须留着。 */
  const ipLimit = parseInt((env && env.AI_IP_LIMIT) || '1000', 10) || 1000;
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
  let vipRecord = null;
  try {
    const v = JSON.parse((await env.SYNC_KV.get('vip:' + acct)) || 'null');
    if (v && v.expire && v.expire > Date.now()) vipRecord = v;
  } catch (e) {}
  const isVip = !!vipRecord;
  const vipQuota = { quarter: shortPlanQuota(vipRecord, now) };

  /* 免费账号每周 5 次只套轻量 AI；写作批改单独按月 3 篇，重活一律会员专属。
     diag 与 rebalance 继续免费且不计入周额度；会员轻量 AI 与写作批改均不限次。 */
  const week = isoWeekKey(now);
  const weekLimit = parseInt((env && env.AI_USER_WEEKLY_LIMIT) != null ? env.AI_USER_WEEKLY_LIMIT : '5', 10) || 0;
  const freeWeeklyService = !isVip && !rule.quota && service !== 'writing_score'
    && service !== 'diag' && service !== 'rebalance';
  if (weekLimit > 0 && freeWeeklyService) {
    let usedWeek = 0;
    try { usedWeek = parseInt((await env.SYNC_KV.get('aiqw:' + acct + ':' + week)) || '0', 10) || 0; } catch (e) {}
    if (usedWeek >= weekLimit) {
      return json({ ok: false, error: 'user_limit', msg: '本周 ' + weekLimit + ' 次免费 AI 用光啦，让 AI 喝口水，下周满血回来；开会员可以接着用' }, 429, env);
    }
  }

  /* ---- 分功能额度：免费写作每月 3 篇；会员重活每项独立计数 ----
     会员重活以服务端签发的任务接力牌合并同一次任务内的多次模型调用；
     任务牌不能伪造，且只在 2xx 成功后落库，失败不吃额度。 */
  const month = monthKey(now);
  const period = rule.quota ? QUOTA_LIMITS[rule.quota].period : null;
  const quotaPeriodKey = rule.quota ? quotaKey(acct, rule.quota, period, now) : null;
  const quotaUsed = rule.quota ? await readNumber(env.SYNC_KV, quotaPeriodKey) : 0;
  const quotaTaskHeader = rule.quota ? String((request.headers.get('X-Ai-Task') || '')).trim() : '';
  const taskPrefix = rule.quota ? quotaTaskPrefixKey(acct, rule.quota, period, now) : '';
  let quotaTaskKey = null;
  let quotaTaskUsed = 0;
  let quotaTaskValid = false;
  if (rule.quota && validTaskToken(quotaTaskHeader)) {
    quotaTaskKey = taskPrefix + quotaTaskHeader;
    quotaTaskUsed = await readNumber(env.SYNC_KV, quotaTaskKey);
    quotaTaskValid = quotaTaskUsed > 0;
  }
  const quotaTotal = rule.quota ? limitOf(rule.quota, vipQuota) : 0;
  const quotaHit = !!(rule.quota && quotaUsed >= quotaTotal && !quotaTaskValid);
  const quotaTaskToken = rule.quota ? (quotaTaskValid ? quotaTaskHeader : makeTaskToken()) : '';
  const quotaTaskFinalKey = rule.quota ? taskPrefix + quotaTaskToken : '';
  if (!isVip) {
    if (rule.quota) {
      return json({ ok: false, error: 'vip_required', msg: '这个功能比较费算力，先给会员开放；普通账号的其他学习功能照常用' }, 403, env);
    }
    if (service === 'writing_score') {
      const wt = parseInt((env && env.AI_FREE_WRITING_TOTAL) != null ? env.AI_FREE_WRITING_TOTAL : '3', 10) || 0;
      if (wt <= 0) {
        return json({ ok: false, error: 'vip_required', msg: '写作批改是会员专属功能' }, 403, env);
      }
      let wUsed = 0;
      try { wUsed = parseInt((await env.SYNC_KV.get('aiqmo:' + acct + ':' + month + ':writing')) || '0', 10) || 0; } catch (e) {}
      if (wUsed >= wt) {
        return json({ ok: false, error: 'writing_limit',
          msg: '本月 ' + wt + ' 篇免费批改用光啦，AI 先去喝口水，下月再来；会员不限篇' }, 429, env);
      }
    }
  } else if (quotaHit) {
    return json({ ok: false, error: 'quota_limit', msg: quotaMessage(rule.quota, vipQuota) }, 429, env);
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
  if (!maxTokens || isNaN(maxTokens) || maxTokens <= 0) maxTokens = rule.max;
  /* SS-DICT-LOCAL-1（11-04）：查词是微内容（一个词最多四个短字段），4096 的默认窗口纯浪费生成时间。
     只对 service==='words' 且前端没显式传 max_tokens 时兜底 256；其它 service 一字不动。 */
  if (maxTokens > rule.max) maxTokens = rule.max;
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
    return json({ ok: false, error: 'upstream_' + upstream.status, msg: 'AI 服务暂时不可用，请稍后再试' }, (upstream.status === 429 ? 429 : 502), env);
  }

  /* 只有真的拿到 2xx 才计额度：上游报错 / 超时 / Key 失效不该吃掉用户配额。
     🔴 10/5 P0 修「计数全部丢写」（她报 admin 面板「今日 AI 次数」恒 0）：
        原来下面四段计数全是「发射后不管」——bumpCount(...) 不 await、(async()=>{})() 不等待，
        函数走到 return 就把响应发走，Workers **不保证响应返回后那些悬空异步写完成**，
        结果 aiq / aiqa / aiqw / aiqmo / aiqm 五个键**一个都没写进去**。
        实测后果（修复前）：面板今日 AI 恒 0、免费用户周额度/模考月额度/分钟风控**全部失效**
        ——连发 13 次全 200（风控阈值 10 次/分），等于盗刷无闸、成本无上限。
        修法：计数必须**在响应返回前落库**。
        ⚠️ 10/5 二次修正：**这里必须 await，不能用 context.waitUntil()**。
        闸门在 176-260 行是「先读 aiqw/aiqm 判超额 → 放行」，若计数拖到响应返回后才落库，
        下一个请求读到的还是旧值 → 必然超发（首版 waitUntil 修法实测：周额度 5 次放行了 6 次、
        分钟风控 10 次放到 12 次，探针段2/段3 各挂 2 条）。**「检查」与「计数」必须串成同一条
        await 链，闸门才成立。** 代价是每次调用多等一个 KV 往返（与本函数已有的十几次 kv.get 同量级）。
        ⚠️ 只改结构：阈值 / 键名 / TTL / service 名 / 免费-会员分层一律不动。 */
  await (async () => {
    /* 各分支相互独立，统一塞 jobs 后一次 Promise.all 等完 —— 只多等一个 KV 往返，不串行叠加 */
    const jobs = [
      /* ① 三个「日 + 10 桶轮转」计数：全站总量 / 单 IP / 按账号（面板读的就是 aiqa:） */
      bumpCount(env.SYNC_KV, 'aiq', day, bucket),
      bumpCount(env.SYNC_KV, 'aiqip:' + ip, day, bucket),
      bumpCount(env.SYNC_KV, 'aiqa:' + acct, day, bucket),   // 按账号计量（会员也计数：面板「今日 AI 次数」要看得到会员用量，只是会员不受额度闸限制）
    ];

    /* 免费写作月额度 / 周兜底 / 会员重活周期额度与任务牌。 */
    if (isVip && rule.quota && !rule.gateOnly) {
      jobs.push((async () => {
        try {
          if (!quotaTaskValid) {
            await env.SYNC_KV.put(quotaTaskFinalKey, String(quotaTaskUsed + 1), { expirationTtl: QUOTA_TTL });
            const cur = await readNumber(env.SYNC_KV, quotaPeriodKey);
            await env.SYNC_KV.put(quotaPeriodKey, String(cur + 1), { expirationTtl: QUOTA_TTL });
          }
        } catch (e) {}
      })());
    }

    if (!isVip) {
      if (service === 'writing_score') {
        jobs.push((async () => {
          try {
            const lk = 'aiqmo:' + acct + ':' + month + ':writing';
            const cur = parseInt((await env.SYNC_KV.get(lk)) || '0', 10) || 0;
            await env.SYNC_KV.put(lk, String(cur + 1), { expirationTtl: 3456000 });
          } catch (e) {}
        })());
      }
      if (freeWeeklyService) {
        jobs.push((async () => {
          try {
            const wk = 'aiqw:' + acct + ':' + week;
            const cur = parseInt((await env.SYNC_KV.get(wk)) || '0', 10) || 0;
            await env.SYNC_KV.put(wk, String(cur + 1), { expirationTtl: 864000 });
          } catch (e) {}
        })());
      }
    }

    /* ②b 🔴 10/6 11:22 补上「本月按账号」计数键 `aiqmv:`（TTL 400 天）
       起因：10/5 P1 有人加了面板的「本周/本月」维度 —— **读侧写了、写侧漏了**：
       `aiqwv:` / `aiqmv:` 这两个键全仓没有任何地方写入，只在 admin.js 里被读。
       后果实测：面板「本周/本月 AI 调用」从 10/5 起冻结在那天的残值（她看到 197/197），
       派生出的「真人本月有没有用过 AI」恒为 0 → 面板误报「真人本月一次 AI 都没用过」。
       ⚠️ 本周（`aiqwv:`）**仍然不补**：面板改用已有 `aistat:` 日数据累加近 7 天（见 admin.js），
          零新增写量。这里只补月键，**单次调用写量 +1（get 不计配额，只有 put 计）**。
       ⚠️ 口径：**所有用户都写（含会员）**，与 `aiqa:` 今日计量一致 —— 面板要看到会员用量。
       ⚠️ 免费豁免的 service（diag/rebalance）也照写：它们同样在花 DeepSeek 的钱。 */
    jobs.push((async () => {
      try {
        const mk = 'aiqmv:' + acct + ':' + month;
        const cur = parseInt((await env.SYNC_KV.get(mk)) || '0', 10) || 0;
        await env.SYNC_KV.put(mk, String(cur + 1), { expirationTtl: 34560000 });
      } catch (e) {}
    })());

    /* ③ 分钟风控计数（TTL 2 分钟自愈；写失败不影响主流程，与 bumpCount 同口径） */
    jobs.push((async () => {
      try {
        const curMin = parseInt((await env.SYNC_KV.get(minKey)) || '0', 10) || 0;
        await env.SYNC_KV.put(minKey, String(curMin + 1), { expirationTtl: 120 });
      } catch (e) {}
    })());

    /* ④ 🔴 10/20 深夜删掉「面板长周期聚合」这两个写（P0 零成本省写量）——
       原来是 10/5 加的两个长 TTL 键，如今两个都不该再写：
         · aiqwv:<acct>:<YYYY-Www> —— **全仓没有任何读方**。admin.js:333-446 已明文改成
           「本周调用 = 最近 7 个自然日的 aistat: 日数据累加」，并且注释写着「替代从不写入
           的 aiqwv:，零新增写量」。这里还在写 = 纯浪费 1 次写。
         · aiqmv:<acct>:<YYYY-MM> —— **上面 ②b 已经写过一次**（同一个键、同一个 cur+1、
           同一个 TTL 34560000），这一段是同一次调用里的第二次写，值完全一样。
           删掉不改变任何读方的结果（admin.js:338 / :664 读到的仍是 ②b 写的那份）。
       ⚠️ 只删统计键，**一个闸门键都没动**：aiqw（周兜底）/ aiqmo（模考月）/ aiqm（分钟风控）
          / aiqip（IP）/ aiq / aiqa 全部原样，所以免费额度与风控行为零变化。
       ⚠️ 单次调用写量 8~11 → 6~9（免费用户含 aiqw/aiqmo/aiqt 的 3 个条件写）。
       ⚠️ 存量 aiqwv: 旧键不清理，TTL 400 天自然过期，无人读不影响任何东西。 */
    /* ⑤ 面板统计合并写（10/5 14:42 P0 修 KV 配额事故）——
       🔴 事故原委：Cloudflare 免费版 **KV 每天只有 1000 次写**（不是 1000MB，与单键体积无关）。
          我今天为 P3 面板加了 5 个统计键（aiday/aidayu/aitok/aitoku/aitoks），
          **把单次 AI 调用的写量从 5 翻到 10**，再连跑 8 轮探针 ≈2900 次写 → 配额爆 →
          **她的云同步直接挂掉**（报 "KV put() limit exceeded for the day"）。

       ✅ 修法（方案 A：5 个键合并成 1 个）：把当天要记的统计**打包进一个 JSON 值**，
          一次 get + 一次 put 写完 → **单次调用写量 10 → 6**（省 40%），功能一项不减。
          键名 aistat:<YYYYMMDD>，值形如 {"n":次数,"pt":promptTok,"ct":completionTok,"svc":{"mock_q":3,...}}
          ⚠️ service 键白名单化后再进 JSON，避免任意字符串膨胀（外层键名已省掉，但值里仍要防）。
          ⚠️ 读改写非原子（KV 无 incr），极端并发下可能少计 1~2 次 —— 只影响面板统计粒度，
             **绝不影响任何额度闸门**（闸门走的是 ①②③ 那几个独立键，逻辑一个字没动）。 */
    jobs.push((async () => {
      try {
        const sKey = 'aistat:' + day;
        let pt = 0, ct = 0;
        try {
          const uj = JSON.parse(text);
          if (uj && uj.usage) {
            pt = parseInt(uj.usage.prompt_tokens, 10) || 0;
            ct = parseInt(uj.usage.completion_tokens, 10) || 0;
          }
        } catch (e) {}
        const svc = /^[a-z0-9_]{1,32}$/.test(service) ? service : 'other';
        let st = null;
        try { st = JSON.parse((await env.SYNC_KV.get(sKey)) || 'null'); } catch (e) {}
        if (!st || typeof st !== 'object') st = { n: 0, pt: 0, ct: 0, svc: {} };
        if (!st.svc || typeof st.svc !== 'object') st.svc = {};
        st.n = (st.n || 0) + 1;
        st.pt = (st.pt || 0) + pt;
        st.ct = (st.ct || 0) + ct;
        st.svc[svc] = (st.svc[svc] || 0) + 1;
        /* 10/6 12:45 她要求「配单价好看到底花了多少」。两件配套（**同一个键多两个字段，0 额外写**）：
           ① m = 上游响应里的真实模型名 —— 官方文档已把 `deepseek-chat` 下线换成 flash / v4-pro，
              而 Cloudflare 后台的 `AI_MODEL` 我读不到，**只能靠响应里这个字段确认她实际用的哪个**；
           ② pch = 缓存命中的输入 token。官方 flash「缓存命中」输入价只有未命中的 1/50（$0.003 vs $0.15），
              本站 system prompt 长且固定，官方说这种情况命中率常 >80% → 不区分缓存，**成本会高估好几倍**。 */
        try {
          const uj = JSON.parse(text);
          if (uj && uj.model) st.m = String(uj.model).slice(0, 40);
          if (uj && uj.usage && uj.usage.prompt_cache_hit_tokens != null) {
            st.pch = (st.pch || 0) + (parseInt(uj.usage.prompt_cache_hit_tokens, 10) || 0);
          }
        } catch (e) {}
        await env.SYNC_KV.put(sKey, JSON.stringify(st), { expirationTtl: 34560000 });
      } catch (e) {}
    })());

    await Promise.all(jobs);
  })();

  // 直接透传上游响应体（前端现有解析逻辑 choices[0].message.content 不用改）
  return new Response(text, {
    status: 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-ai-model': model,
      ...(quotaTaskToken ? { 'x-ai-task': quotaTaskToken } : {}),
    }, corsHeaders(env)),
  });
}
