// Cloudflare Pages Function: /api/sync
// 按「手机号」读写 KV（SYNC_KV）。与考研站（kaoyan-tracker）完全一致的契约：
//   账号 = 手机号（6~15 位数字），通过请求头 X-Sync-Key 传递（兼容 ?code= 查询参数）。
//   相同手机号 = 同一份云端数据（多设备共享）。非 Cloudflare 部署时 /api/sync
//   会 404，前端所有调用都会优雅降级（不报错、不弹窗刷屏）。
//
// 前端约定：
//   GET    /api/sync  (X-Sync-Key: <phone>) -> 返回 { data, ts, updatedAt } 或 404
//   PUT    /api/sync  (X-Sync-Key: <phone>) body { data, ts, deviceId } -> { ok:true, ts }
//   DELETE /api/sync  (X-Sync-Key: <phone>) -> { ok:true }
//
// 部署：先建 KV 命名空间 + 在 wrangler.toml 绑定 SYNC_KV，再 `wrangler pages deploy .`

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
  // 账号优先取 X-Sync-Key 请求头；兼容旧的 ?code= 查询参数
  const phone = (request.headers.get('X-Sync-Key') || url.searchParams.get('code') || '').trim();

  // 账号必填，且必须是 6~15 位数字（手机号）
  if (!phone || !/^\d{6,15}$/.test(phone)) {
    return json({ ok: false, error: '无效的手机号（需 6-15 位数字）' }, 400);
  }

  const key = 'sync:' + phone;

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
      deviceId: body.deviceId || null,
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
