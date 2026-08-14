// Cloudflare Pages Function: /api/sync
// 按「6 位登录码」读写 KV（SYNC_KV）。可选 SYNC_TOKEN 全局守卫，防陌生人乱写。
// 部署：先建 KV 命名空间 + 在 wrangler.toml 绑定 SYNC_KV，再 `wrangler pages deploy .`
//
// 前端约定：
//   GET  /api/sync?code=XXXXXX[&token=...]        -> 返回 { data, ts, updatedAt } 或 404
//   PUT  /api/sync?code=XXXXXX[&token=...]  body { data, ts } -> { ok:true, ts }
//   DELETE /api/sync?code=XXXXXX[&token=...]       -> { ok:true }

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const token =
    url.searchParams.get('token') ||
    request.headers.get('x-sync-token') ||
    '';
  const SYNC_TOKEN = env.SYNC_TOKEN || '';

  // 登录码必填，且必须是 6 位数字
  if (!code || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: '无效的登录码（需 6 位数字）' }, 400);
  }

  // 若部署者设置了全局令牌，则请求必须带匹配的 token（GET 也校验，避免数据泄露）
  if (SYNC_TOKEN && token !== SYNC_TOKEN) {
    return json({ ok: false, error: '令牌不匹配' }, 401);
  }

  const key = 'sync:' + code;

  if (request.method === 'GET') {
    const raw = await env.SYNC_KV.get(key);
    if (!raw) return json({ ok: false, error: 'no data' }, 404);
    return new Response(raw, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
    }
    if (!body || typeof body !== 'object' || !body.data) {
      return json({ ok: false, error: '缺少 data 字段' }, 400);
    }
    const stored = {
      data: body.data,
      ts: body.ts || Date.now(),
      updatedAt: new Date().toISOString(),
    };
    await env.SYNC_KV.put(key, JSON.stringify(stored));
    return json({ ok: true, ts: stored.ts });
  }

  if (request.method === 'DELETE') {
    await env.SYNC_KV.delete(key);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'method not allowed' }, 405);
}
