// Cloudflare Pages Function: /api/explain
//
// 用途：**解析（讲解）的唯一出口**。解析永远不随页面下发，只经本接口按权限返回。
//   缘起 10/19：她要求「题目公开、答案与解析不下发」。实测答案文件里只有答案键、
//   没有任何解析；因此把「解析」做成服务端内容，从第一天起就不进浏览器。
//
// 存储：Cloudflare KV（复用 SYNC_KV 绑定），键名 `explain:<unitId>`，值形如：
//   { "v": 1, "updatedAt": "2026-10-19T…", "items": {
//       "1": { "text": "解析正文…", "tip": "可选一句话提示", "access": "free" },
//       "2": { "text": "…", "access": "paid" } } }
//   access 缺省 = free。**权限位是数据**：以后要改成付费墙，灌数据时写 paid 即可，不用改代码。
//
// 三条硬约束（改本文件前先读）：
//   ① **paid 内容绝不能出现在无凭证响应里** —— 过滤在服务端完成，不靠前端藏。
//   ② 前端目前**没有任何入口**调用本接口（站内红线：没有的能力不进文案）。
//      将来上线解析时，才在页面里加入口。
//   ③ 本接口只读，不写；内容由 `scripts/explain-content.cjs` 生成本地 KV 命令上传。
//
// 接口：
//   GET /api/explain?unit=<unitId>            → 返回该篇允许看到的解析
//   GET /api/explain?unit=<unitId>&meta=1     → 轻量探测 { has, free, paid }（不含正文）
//
// 鉴权：可选。带 X-Session（或 ?session=）且有效 → 允许 paid；否则只返回 free。
//       与 /api/sync 同口径（查 KV 的 sess:<token> 解出账号）。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Session',
  'access-control-max-age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

/* 从 KV 解出「当前请求是否具备付费权限」。
   口径与 /api/sync 完全一致：sess:<token> → { acct | phone }。
   任何异常一律当作「无付费权限」（fail closed），绝不因为报错而放行。 */
async function paidAllowed(env, sid) {
  if (!sid || !/^[0-9a-f]{32,128}$/.test(sid)) return false;
  try {
    const raw = await env.SYNC_KV.get('sess:' + sid);
    if (!raw) return false;
    const s = JSON.parse(raw);
    const acct = String((s && (s.acct || s.phone)) || '').trim();
    if (!acct) return false;
    /* 过期判断：sess 记录若有 exp 字段且已过期 → 拒绝。
       老记录没有 exp（/api/auth 早期写入）时不判过期，与 sync 的口径保持一致。 */
    if (s && s.exp != null && Number(s.exp) > 0 && Date.now() > Number(s.exp)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

/* 纯函数：按权限裁剪 items —— 单独抽出便于本地单测（见 tests/_explain_api_test.mjs）。
   返回 { items:{qno:{text,tip}}, locked:<付费且无权看的条数> } */
export function filterItems(items, allowPaid) {
  const out = {}, locked = { n: 0 };
  if (!items || typeof items !== 'object') return { items: out, locked: 0 };
  for (const qno of Object.keys(items)) {
    const it = items[qno];
    if (!it || typeof it !== 'object') continue;
    const access = (it.access === 'paid') ? 'paid' : 'free';
    if (access === 'paid' && !allowPaid) { locked.n++; continue; }
    const one = { text: String(it.text == null ? '' : it.text) };
    if (it.tip != null && String(it.tip) !== '') one.tip = String(it.tip);
    out[qno] = one;              // ⚠️ 只搬 text/tip，绝不整条透传（防止未来加字段时误下发内部信息）
  }
  return { items: out, locked: locked.n };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const unit = String(url.searchParams.get('unit') || '').trim();

  /* unitId 只允许字母数字与下划线/连字符（现有题库 id 为纯数字长串）。
     白名单化可避免拼出任意 KV 键（如通过 unit 读到 sess: 之类别的命名空间）。 */
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(unit)) {
    return json({ ok: false, error: 'bad unit' }, 400);
  }

  if (!env || !env.SYNC_KV) {
    return json({ ok: false, error: 'content store not bound' }, 503);
  }

  let doc = null;
  try {
    const raw = await env.SYNC_KV.get('explain:' + unit);
    if (raw) doc = JSON.parse(raw);
  } catch (e) {
    return json({ ok: false, error: 'content unreadable' }, 500);
  }

  const items = (doc && doc.items && typeof doc.items === 'object') ? doc.items : {};
  const total = Object.keys(items).length;

  // 轻量探测：只告诉「有没有、几条免费几条付费」，不含正文
  if (url.searchParams.get('meta') === '1') {
    let free = 0, paid = 0;
    for (const k of Object.keys(items)) {
      const a = (items[k] && items[k].access === 'paid') ? 'paid' : 'free';
      if (a === 'paid') paid++; else free++;
    }
    return json({ ok: true, unit, has: total > 0, total, free, paid });
  }

  const sid = (request.headers.get('X-Session') || url.searchParams.get('session') || '').trim();
  const allowPaid = await paidAllowed(env, sid);
  const r = filterItems(items, allowPaid);

  return json({
    ok: true,
    unit,
    updatedAt: (doc && doc.updatedAt) || null,
    items: r.items,
    locked: r.locked,
    paid: allowPaid,
  });
}
