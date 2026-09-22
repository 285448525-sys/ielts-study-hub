/* ielts-hub Service Worker — 2026-09-20 重写（预缓存核心壳 + 分级缓存，弱网/离线可打开）
   历史脉络（勿删注释，防后人再走弯路）：
   - 8/30 旧版「network-first + 回退缓存」在农村弱网回退旧 JS/CSS →「改了不生效」顽疾；
   - 9/4 改为「全网络直通 + 主动注销」——治了顽疾但离线完全不可用；
   - 现版：HTML network-first（保部署后先拿新 HTML）+ 静态资源 stale-while-revalidate
     （缓存键一律去 ?v= 的 pathname，不受手工版本号影响）+ 核心壳预缓存（离线首开可用）。
     版本一致性兜底 = 页面侧 navDeployProbe / navSelfHealReload 自愈机制（common.js，禁删）。
     离线态（design/79）由 common.js 的 online/offline 监听在页面侧驱动（状态灯 + 自愈离线闸），
     SW 不参与离线态的判定与渲染，缓存策略本文件零改动。
     本文件 activate 时发的 `SW_UPDATED` 消费端也在 common.js（maybeShowSwUpdatePrompt，
     design/78）：页面收到后只弹提示条，**是否刷新由用户点击决定，SW 侧绝不自动 reload**。 */
const CACHE = 'ielts-hub-v37';

/* 核心壳预缓存清单（Node 脚本枚举目录生成，2026-09-20；与 14 页实际引用核对无遗漏）。
   不含 js/vendor/xlsx.full.min.js（861KB 体积大 → 走运行时 SWR 缓存）。 */
const PRECORE = [
  '/corpus.html',
  '/errorbook.html',
  '/index.html',
  '/materials.html',
  '/meds.html',
  '/pattern-drill.html',
  '/plans.html',
  '/practice.html',
  '/review.html',
  '/settings.html',
  '/speaking.html',
  '/timer.html',
  '/writing.html',
  '/wrongbook.html',
  '/css/common.css',
  '/js/common.js',
  '/js/corpus.js',
  '/js/data.js',
  '/js/dhp_policy.js',
  '/js/history.js',
  '/js/index.js',
  '/js/materials.js',
  '/js/meds.js',
  '/js/mock-history.js',
  '/js/mock-report.js',
  '/js/mock-summary.js',
  '/js/mock.js',
  '/js/pattern-drill.js',
  '/js/plans.js',
  '/js/practice.js',
  '/js/progress.js',
  '/js/review.js',
  '/js/scene-drill.js',
  '/js/scores.js',
  '/js/sentence-drill.js',
  '/js/settings.js',
  '/js/speaking-practice.js',
  '/js/speaking.js',
  '/js/timer.js',
  '/js/wordbank.js',
  '/js/words.js',
  '/js/writing.js',
  '/js/writing_prompts.js',
  '/js/wrongbook.js',
  '/data/materialsets.json',
  '/data/official-banks/awl.json',
  '/data/patterns.json',
  '/data/scenes.json',
  '/data/sentences.json',
  '/data/writing_prompts.json',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

/* HTML 导航 network-first 的网络超时（弱网 4s 拿不到就回退缓存，绝不让用户干等白屏） */
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐条预缓存且单条失败不炸整体（cache:'reload' 绕过 HTTP 缓存拿部署源最新）：
    // 某一条 404/弱网失败只丢那一条的离线可用，不能让整个 install 失败导致 SW 永远装不上
    await Promise.all(PRECORE.map(async u => {
      try{
        const res = await fetch(u, { cache: 'reload' });
        if(res && res.ok){ await cache.put(u, res); }
      }catch(_){ /* 单条失败静默：只丢该条的离线可用 */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 删除所有非当前版本缓存（含历史 v1~v13）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 通知已打开页面「SW 已更新」（可选通知：页面现有自愈机制决定是否 reload，SW 绝不自行强制刷新）
    try{
      const cs = await self.clients.matchAll();
      cs.forEach(c => { try{ c.postMessage({ type: 'SW_UPDATED', version: CACHE }); }catch(_){} });
    }catch(_){}
  })());
});

/* ---- 工具：响应是否可入缓存（只缓存同源 200 全量响应，防 206/opaque 混入） ---- */
function cacheable(res){
  return res && res.status === 200 && res.type === 'basic';
}

/* ---- 工具：把响应写入缓存（键 = 去 ?v= 的 pathname，与预缓存统一） ---- */
function putInCache(url, res){
  return caches.open(CACHE)
    .then(c => c.put(new Request(url.pathname), res.clone()))
    .catch(() => {});
}

/* ---- 分级①：页面导航 network-first（4s 超时）→ 缓存该页 → 缓存 /index.html ---- */
async function handleNavigate(req, url){
  // 网络请求竞速 4s；成功顺手写缓存（后台继续，不阻塞响应路径）
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  // ⚠️ fetch 离线/失败时 netPromise 是「resolve(null)」而非 reject——
  //    必须对「拿到 null」也走缓存兜底，绝不能把 null 交给 respondWith（= 网络错误页）
  let net = null;
  try{
    net = await Promise.race([
      netPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('nav timeout')), NAV_TIMEOUT_MS))
    ]);
  }catch(_){ /* 超时 → 走缓存兜底；netPromise 继续后台完成写缓存 */ }
  if(net) return net;
  const cached = await caches.match(url.pathname);
  if(cached) return cached;
  const shell = await caches.match('/index.html');
  if(shell) return shell;
  // 缓存全无（如首次访问即弱网）：等网络最终结果，仍失败给明确 503（绝不白屏无响应）
  const final = await netPromise;
  return final || new Response('离线', { status: 503, statusText: 'Offline' });
}

/* ---- 分级②：静态资源 stale-while-revalidate ---- */
async function handleStatic(req, url){
  const cached = await caches.match(url.pathname);
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  if(cached){
    netPromise.catch(() => {});   // 后台 revalidate 用原始 URL（保留 ?v=），失败静默
    return cached;
  }
  const net = await netPromise;
  return net || new Response('离线', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;                    // 非 GET 透传
  let url;
  try{ url = new URL(req.url); }catch(_){ return; }
  if(url.origin !== location.origin) return;          // 跨域（api.deepseek.com 等）透传，不缓存不回退
  if(url.pathname.startsWith('/api/')) return;        // 云同步 API 永远透传
  if(url.search.indexOf('_probe') > -1) return;       // navDeployProbe 部署探针永远透传（保自愈机制有效）

  // ① 页面导航（request.mode==='navigate' 或 .html）→ network-first
  if(req.mode === 'navigate' || /\.html$/.test(url.pathname)){
    e.respondWith(handleNavigate(req, url));
    return;
  }
  // ② 静态资源 → stale-while-revalidate
  if(/\.(js|css|json|png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|mp3|wav|webmanifest)$/.test(url.pathname)){
    e.respondWith(handleStatic(req, url));
    return;
  }
  // ③ 其他同源 GET → network-first 失败回退缓存
  e.respondWith(
    fetch(req).then(res => {
      if(cacheable(res)) putInCache(url, res);
      return res;
    }).catch(() =>
      caches.match(url.pathname).then(c => c || Promise.reject(new Error('offline')))
    ).catch(() => new Response('离线', { status: 503, statusText: 'Offline' }))
  );
});
