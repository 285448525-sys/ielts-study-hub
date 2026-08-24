const CACHE = 'ielts-hub-v3';
const SHELL = ['/', '/index.html', '/css/common.css', '/js/common.js', '/js/data.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // 删除旧版本缓存（v1/v2 可能含「清空整库」的旧 index.html / common.js），强制手机端丢弃陈旧外壳
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;  // 只处理同源 GET
  // ⚠️ 网络优先：永远先取最新资源。修复「手机端 Service Worker 缓存旧 index.html/common.js →
  //    其中仍含『清空整个 HUB_KEY』的旧 autoCleanOldBank，登录后云端同步拉回含 early morning 话题的口语库，
  //    旧 autoClean 据此把手机号/API Key/发音分整库抹掉」的死亡循环。
  //    网络成功即返回最新（并顺手更新缓存供离线回退）；仅当网络彻底失败才回退缓存。
  e.respondWith(
    fetch(req).then(res => {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(req, cp)).catch(()=>{});  // 离线回退用，不影响在线取新
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
  );
});
