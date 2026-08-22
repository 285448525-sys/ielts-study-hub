// Cloudflare Pages Function: /api/sync
// 按「手机号」读写 KV（SYNC_KV）。
//   账号 = 手机号（6~15 位数字），通过请求头 X-Sync-Key 传递（兼容 ?code= 查询参数）。
//   相同手机号 = 同一份云端数据（多设备共享）。
//
// 前端约定：
//   GET    /api/sync  (X-Sync-Key: <phone>) -> 返回 { data, ts, updatedAt } 或 404
//   PUT    /api/sync  (X-Sync-Key: <phone>) body { data, ts, deviceId } -> { ok:true, ts }
//   DELETE /api/sync  (X-Sync-Key: <phone>) -> { ok:true }
//
// CORS：前端用自定义请求头 X-Sync-Key，浏览器会先发 OPTIONS 预检。本函数显式处理
//       OPTIONS 并回完整的 CORS 响应头（Allow-Methods / Allow-Headers），否则预检失败
//       浏览器会报 "Failed to fetch"，真实请求根本不会发出。
//
// 部署：先建 KV 命名空间 + 在 wrangler.toml 绑定 SYNC_KV，再 `wrangler pages deploy .`

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Sync-Key',
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

export async function onRequest(context) {
  const { request, env } = context;

  // 预检请求：直接回 204 + CORS 头，不进入业务逻辑
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  // 账号优先取 X-Sync-Key 请求头；兼容旧的 ?code= 查询参数
  const phone = (request.headers.get('X-Sync-Key') || url.searchParams.get('code') || '').trim();

  // 账号必填，且必须是 6~15 位数字（手机号）
  if (!phone || !/^\d{6,15}$/.test(phone)) {
    return json({ ok: false, error: '无效的手机号（需 6-15 位数字）' }, 400);
  }

  // KV 未绑定：给出明确提示而非抛错（避免浏览器收到无 CORS 头的 500 → Failed to fetch）
  if (!env || !env.SYNC_KV) {
    return json({ ok: false, error: '云端存储未启用（请在 Cloudflare Pages 设置里绑定 SYNC_KV 命名空间）' }, 503);
  }

  const key = 'sync:' + phone;

  if (request.method === 'GET') {
    const raw = await env.SYNC_KV.get(key);
    if (!raw) return json({ ok: false, error: 'no data' }, 404);
    return new Response(raw, {
      headers: Object.assign({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      }, CORS),
    });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    // 先读原始字节，限制请求体大小，防止超大 JSON 耗尽 Worker 内存 / KV 写入配额
    const MAX_BODY = 5 * 1024 * 1024; // 5MB
    let buf;
    try {
      buf = await request.arrayBuffer();
    } catch (e) {
      return json({ ok: false, error: '读取请求体失败' }, 400);
    }
    if (buf.byteLength > MAX_BODY) {
      return json({ ok: false, error: '请求体超过 5MB 限制' }, 413);
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(buf));
    } catch (e) {
      return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
    }
    if (!body || typeof body !== 'object' || !body.data) {
      return json({ ok: false, error: '缺少 data 字段' }, 400);
    }
    const stored = {
      data: body.data,
      ts: (body.ts != null && !isNaN(Number(body.ts))) ? Number(body.ts) : Date.now(),
      deviceId: body.deviceId || null,
      updatedAt: new Date().toISOString(),
    };
    try {
      const value = JSON.stringify(stored);
      if (value.length > 25 * 1024 * 1024) {
        return json({ ok: false, error: '单条数据超过 Cloudflare KV 25MB 上限（当前 ' + Math.round(value.length / 1024 / 1024) + 'MB）' }, 413);
      }
      await env.SYNC_KV.put(key, value);
      return json({ ok: true, ts: stored.ts });
    } catch (e) {
      return json({ ok: false, error: 'KV 写入失败：' + (e && e.message ? e.message : String(e)) }, 500);
    }
  }

  if (request.method === 'DELETE') {
    await env.SYNC_KV.delete(key);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'method not allowed' }, 405);
}
