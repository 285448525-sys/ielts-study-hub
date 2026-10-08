/* 10/8 晚 紧急缓存重置入口（她侧被旧 SW 残缓存卡死的核武级出口，一次点击生效）
   原理：Clear-Site-Data: "cache" 由**服务器响应头**下发，浏览器在收到该文档响应时
   清空本源的 HTTP 缓存 + Cache Storage（即 PWA 离线缓存）——SW 拦不住、页面脚本不需要参与。
   ⚠️ 只清 "cache"，**绝不带 "storage"/"cookies"**：localStorage（她的 4.5 记录/全部学习数据）不受影响。
   ⚠️ 访问路径必须带 ?_probe=1 —— sw.js 对含 _probe 的请求直接透传（不拦截），保证响应头必达。
   用后即弃：等所有老用户都过了这一轮（或明天）删掉本文件。 */
export async function onRequest(context) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>缓存已清理</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f9fb;color:#22313a;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="max-width:420px;padding:32px 28px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(20,40,50,.12);text-align:center">
<p style="font-size:40px;margin:0 0 8px">✅</p>
<h1 style="font-size:20px;margin:0 0 10px">缓存已清干净了</h1>
<p style="font-size:14px;line-height:1.8;color:#5b6b75;margin:0 0 20px">你的学习数据、评分记录一个都没动，只清掉了旧版本的残留文件。<br>点下面按钮回网站，这次看到的一定是最新版。</p>
<a href="/home" style="display:inline-block;background:#3a9a93;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px">回到网站</a>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // ⭐ 关键：只清 cache（HTTP 缓存 + Cache Storage）——不碰 storage/cookies（她的数据）
      'Clear-Site-Data': '"cache"',
      'Cache-Control': 'no-store'
    }
  });
}
