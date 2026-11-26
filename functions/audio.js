// Cloudflare Pages Function: /audio —— 听力音频同源代理（她 11-26：「浏览器端第三方源问题，解决掉」）
//
// 根因（已实测，非推测）：
//   · 听力音频原样直引第三方图床 static.9fnnn.com（347 个 URL 全部 HTTP 200/206、audio/mpeg、
//     mp3 魔数正确、CORS `*`，文件本身没有坏）；本地干净浏览器实测 readyState=4、duration 正常、无报错。
//   · 失败只发生在**用户侧网络到不了该第三方源**时（她：「别人的可以，你就不行」）。
//   · 音频总体积 3.17GB（347 个、平均 9.1MB），塞进仓库自托管不现实。
// 解法：
//   · 浏览器改从**自己域名** `/audio?u=<第三方路径>` 取音频；本 Function 在 Cloudflare 边缘
//     回源 static.9fnnn.com 并流式回传。用户到我们域名的链路稳定，第三方可达性由边缘兜，
//     彻底摆脱「跨域第三方源直引」这个单点。
//   · 路径走查询参数 `u`（刻意不用 /audio/* 的 [...path].js —— 带方括号的文件名会让 CF Pages
//     构建直接失败，已实测踩过），透传 Range（媒体拖动/分片要 206），保留
//     Content-Type / Content-Length / Content-Range / Accept-Ranges，音频可正常播放与拖动。
//
// 红线：只代理 static.9fnnn.com 这一个上游；`u` 必须是纯路径，禁止协议/主机注入（防 SSRF）。
//       上游非 2xx 时回 502，交由前端既有报错兜底。

const UPSTREAM = 'https://static.9fnnn.com/';

// 允许透传的响应头（媒体播放需要）；其余头一律不透传，避免泄露上游内部信息。
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function onRequest(context) {
  const { request } = context;
  const u = new URL(request.url).searchParams.get('u');
  if (!u) return new Response('missing audio path', { status: 400 });

  // 只接受纯路径：禁止协议、主机、反斜杠、协议相对（防 SSRF 把请求转去任意主机）
  if (u.indexOf('//') >= 0 || u.indexOf(':') >= 0 || u.indexOf('\\') >= 0 || u.indexOf('@') >= 0) {
    return new Response('bad audio path', { status: 400 });
  }
  const target = UPSTREAM + u;

  // 透传 Range（媒体分片/拖动），其余请求头不带，保持边缘回源干净
  const upHeaders = new Headers();
  const range = request.headers.get('range');
  if (range) upHeaders.set('range', range);

  let upstream;
  try {
    upstream = await fetch(target, { method: 'GET', headers: upHeaders, redirect: 'follow' });
  } catch (e) {
    return new Response('audio upstream unreachable', {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (!upstream.ok) {
    return new Response('audio upstream error ' + upstream.status, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const out = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // 音频是按唯一 ID 命名的不可变文件：边缘长缓存，回源一次后全站共享，省 Function 调用
  out.set('cache-control', 'public, max-age=86400');
  out.set('access-control-allow-origin', '*');

  // 流式回传（保留上游状态码：200 全量 / 206 分片）
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
