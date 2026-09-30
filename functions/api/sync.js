// Cloudflare Pages Function: /api/sync
// 按「手机号」读写 KV（SYNC_KV）。
//   账号 = 手机号（6~15 位数字）或邮箱，通过请求头 X-Sync-Key 传递（兼容 ?code= 查询参数）。
//   相同账号 = 同一份云端数据（多设备共享）。
//   9/30 起支持邮箱账号（/api/auth 发验证码登录）：邮箱落在 sync:e:<邮箱> 独立命名空间，
//   与既有手机号账号完全隔离——老用户换成邮箱登录 = 另一份空数据，不会覆盖也不会读到旧库。
//
// 前端约定：
//   GET    /api/sync  (X-Sync-Key: <phone>) -> 返回 { data, ts, updatedAt } 或 404
//   PUT    /api/sync  (X-Sync-Key: <phone>) body { data, ts, deviceId } -> { ok:true, ts }
//   DELETE /api/sync  (X-Sync-Key: <phone>) -> { ok:true }
//
// ⭐ 9/30 v2：乐观锁 + 影子 meta（修「同步经常不同步 / 被覆盖」）
//   1) PUT 可携带 baseTs（= 客户端最后一次看到的云端 ts）。
//      云端现存 ts 与之不符 -> 409 { ok:false, error:'conflict', ts:<服务端当前ts> }，
//      服务端**拒绝覆盖**。客户端收到 409 后自行拉取云端 -> 合并 -> 带新 baseTs 重试。
//      旧客户端不带 baseTs：维持原「无条件覆盖」语义，向后兼容（不做破坏性变更）。
//      根因回顾：此前 PUT 完全无版本校验，任何一端都能无条件整份覆盖云端，
//      两台设备各自 push 自己的快照 = 互相抹掉对方进度（她实测到的数据回滚/丢，不是配额问题）。
//   2) meta 影子键 meta:<phone>，只存 { ts, bytes, hash }（约 200B）。
//      GET ?meta=1 时先读它做「云端有没有变」的轻量探测 —— 没变就完全不下载 1.7MB 全量，
//      流量与 CPU 降两个数量级（轮询因此可以加密到 12s 而不增加负担）。
//      meta 缺失（本次部署前写入的老数据）时按需从主键算出来并懒写回，自愈。
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

/* djb2 字符串哈希 —— 必须与前端 js/common.js 的 hashData() 逐位一致，
   否则「云端内容是否变化」的探测会永远失配（退化为每次全量下载——不省钱但功能仍正确）。
   两边都用 <<5 触发 ToInt32，溢出行为完全一致。 */
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return String(h);
}

/* 从完整 blob 字符串里抽出 { ts, bytes, hash } 做 meta 影子键的小体积内容 */
function metaFromRaw(raw) {
  try {
    const obj = JSON.parse(raw);
    const dataStr = JSON.stringify(obj && obj.data !== undefined ? obj.data : null);
    return {
      ts: (obj && obj.ts != null && !isNaN(Number(obj.ts))) ? Number(obj.ts) : 0,
      bytes: raw.length,
      hash: djb2(dataStr),
    };
  } catch (e) {
    return { ts: 0, bytes: raw.length, hash: djb2(raw) };
  }
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

  // 9/30：账号 = 手机号（6~15 位数字）**或邮箱**（邮箱登录走 /api/auth 验证码，入口不同、凭证同级别）。
  const isMail = phone.length <= 64 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(phone);
  const isPhone = /^\d{6,15}$/.test(phone);
  if (!phone || (!isPhone && !isMail)) {
    return json({ ok: false, error: '无效的账号（需 6-15 位手机号或邮箱）' }, 400);
  }
  // ⭐ 邮箱账号落在独立命名空间 sync:e:<邮箱>：
  //    ① 与老手机号账号物理隔离，老数据一个字节都不会被动到；
  //    ② 邮箱统一小写，避免 Foo@x.com 与 foo@x.com 变成两份数据。
  const ns = isMail ? ('e:' + phone.toLowerCase()) : phone;

  // KV 未绑定：给出明确提示而非抛错（避免浏览器收到无 CORS 头的 500 → Failed to fetch）
  if (!env || !env.SYNC_KV) {
    return json({ ok: false, error: '云端存储未启用（请在 Cloudflare Pages 设置里绑定 SYNC_KV 命名空间）' }, 503);
  }

  const key = 'sync:' + ns;
  const metaKey = 'meta:' + ns;

  if (request.method === 'GET') {
    // ⭐ 9/30：轻量探测。只回 {ts,bytes,hash}（约 200B），云端没变就不必搬运整份 1.7MB。
    if (url.searchParams.get('meta') === '1') {
      let mRaw = null;
      try { mRaw = await env.SYNC_KV.get(metaKey); } catch (e) {}
      if (mRaw) {
        try { return json(JSON.parse(mRaw)); } catch (e) { /* meta 损坏：落到下面重算 */ }
      }
      const raw = await env.SYNC_KV.get(key);
      if (!raw) return json({ ok: false, error: 'no data' }, 404);
      const m = metaFromRaw(raw);
      // 老数据（本次部署前写入的）没有 meta：顺手补写，下次起就是纯 200B 探测（自愈）
      try {
        const p = env.SYNC_KV.put(metaKey, JSON.stringify(m));
        if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
      } catch (e) {}
      return json(m);
    }

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

    /* ⭐ 9/30 乐观锁：带 baseTs 的请求必须建立在「客户端已知的最新云端版本」之上。
       现存 ts 与 baseTs 不符 = 期间有别的设备/标签页写过 -> 拒绝整份覆盖，
       让客户端先合并再重试。不带 baseTs（老客户端）维持无条件覆盖，向后兼容。 */
    const hasBase = (body.baseTs != null && body.baseTs !== '' && !isNaN(Number(body.baseTs)));
    const baseTs = hasBase ? Number(body.baseTs) : 0;
    if (hasBase) {
      const cur = await env.SYNC_KV.get(key);
      if (cur) {
        let curTs = 0;
        try { const o = JSON.parse(cur); curTs = (o && o.ts != null && !isNaN(Number(o.ts))) ? Number(o.ts) : 0; } catch (e) {}
        if (curTs !== baseTs) {
          return json({
            ok: false, error: 'conflict', conflict: true,
            ts: curTs,   // 客户端拿它当新的 baseTs（也可先拉云merge）
            updatedAt: Date.now(),
          }, 409);
        }
      }
    }

    // design/62 安全兜底：AI Key 严禁落云端。
    // 即使老客户端 / 旧缓存页面仍带 relayToken 上传，服务端也在此剥离；
    // 下一次 PUT 会整体覆盖，云端存量 Key 随之被清掉。
    if (body.data && body.data.settings && typeof body.data.settings === 'object') {
      delete body.data.settings.relayToken;
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
      // meta 影子键：给轮询做 200B 级探测用。写入失败不影响主流程（下次按需重算）。
      try {
        const m = { ts: stored.ts, bytes: value.length, hash: djb2(JSON.stringify(stored.data)) };
        const p = env.SYNC_KV.put(metaKey, JSON.stringify(m));
        if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
        return json({ ok: true, ts: stored.ts, bytes: m.bytes, hash: m.hash });
      } catch (e) {
        return json({ ok: true, ts: stored.ts });
      }
    } catch (e) {
      return json({ ok: false, error: 'KV 写入失败：' + (e && e.message ? e.message : String(e)) }, 500);
    }
  }

  if (request.method === 'DELETE') {
    await env.SYNC_KV.delete(key);
    try { await env.SYNC_KV.delete(metaKey); } catch (e) {}   // meta 跟着删，否则残留会让客户端以为云端还有数据
    return json({ ok: true });
  }

  return json({ ok: false, error: 'method not allowed' }, 405);
}
