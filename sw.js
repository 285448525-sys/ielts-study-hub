// ielts-hub Service Worker — 2026-08-30 重构
// 根因：旧版「网络优先 + 失败回退缓存」在农村弱网下会回退到旧缓存的 JS/CSS，
//       导致"改了不生效 / 数字冻结 / 词反复出现"长期顽疾。
// 修复：对本站所有同源 GET 一律走网络，绝不写入长期缓存、绝不回退旧缓存。
//       这样每次加载都取到 Cloudflare 上的最新部署，旧缓存永远不会被serve。
const CACHE = 'ielts-hub-v13';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  // 安装新 SW 时清空所有历史缓存（v1/v2/v3 可能含旧 JS/CSS），强制丢弃陈旧资源
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 一律走网络取最新；弱网失败就直接失败（宁可页面打不开，也不许serve旧JS）
  e.respondWith(fetch(req));
});
