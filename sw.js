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
const CACHE = 'ielts-hub-v197';  // 10/4 00:50 P0 修模考报告「未作答不扣分」（她 00:38 报「P1 全部跳过、P2P3 答得一坨屎，结果还给我打5.5」）——🚨 **根因（探针 outputs/design/_diag_score_empty.cjs 实锤）**：js/mock.js:646 用 `(a.transcript || '(空)')` 拼 block，**P1 全未答时拼出的 block 仍非空**（98 字符，因为还有 Q: 题面）→ 唯一防线 `if(!block.trim()) return null` **拦不住** → 照样调 AI → AI 面对一屏「(空)」按默认中位给 5.5 → 总分 (5.5+P2+P3)/3 把她的真实水平拉平。同时 fixes 里出现**根本没作答的题的编造点评**（她截图里「About more than 10 years → More than 10 years」）。
  // 10/4 01:10 登录页左栏 A 版（她 01:02「登录页用A方案」）—— 一整块深色大字 + 四条真实功能。
  // 【背景】她 00:29 提「左栏写的是不痛不痒的点，改成真正卖点」；我第一版把「7天卡¥19（原价¥39）」写进左栏，
  //      她 00:34 发火：「谁家好人在登录页提收费」→ 已 git checkout 回滚，本版**零价格零套餐**（价格只属落地页/会员页）。
  // 【A版结构】深色大字块 =「这个网站，是 / 一个正在备考雅思的人给自己做的 / 我10月9号机考…自己每天在用」
  //      (1) 这条是最强差异化——机构/产品都说不出「我自己在备考」这句话。
  //  下面四条功能（全部 grep 核实站里真有其功能，非编造）：
  //      ① AI 定制备考方案（诊断 diagnosis + 每日重排 REBALANCE_AI_SYSTEM 两条 AI 线）
  //      ② 口语串题（素材卡对照当季题库算 coverage）
  //      ③ 题库分高低频（ultra/high/medium/low 四档，超高频优先背）
  //      ④ AI 陪练口语（读完你的故事才追问，难度跟着你变）
  //  底部一行真实数据背书「当季 88 个话题卡 · 223 个 P2 考点 · 题库已迭代 15 版」（探针 outputs/design/_diag_bank_size.cjs 实测，
  //      取代旧的「100 题 / 570 词」——那两个数是虚的且过时）。
  // 【顺带修】右栏表单卡加了「为什么要登录」说明（不登录数据只在本机、清缓存/换设备就没了），
  //      把左栏变高后右下角的空白填实；.form 改 flex 垂直居中。
  // ⚠️ 坑：login.html 是**独立精简 token 集**（只有 --p-50/100/200/500/600/700/900 与 --n-0/300/500/600/700/900），
  //      **没有 --primary-400 / --primary-50**（那是 common.css 的全站 token）→ 第一版写了会取不到色，已改成 --p-200 / --p-50。
  //      改 login.html 前先 grep 它的 :root 定义。
  // 探针 outputs/design/_verify_loginbrand.cjs 29/29 + _verify_loginfrom.cjs 12/12（回跳逻辑零回归）。SW v196→v197。
  // 10/4 00:50 P0 修模考报告「未作答不扣分」（她 00:38 报「P1 全部跳过、P2P3 答得一坨，结果还给我打 5.5」）
  // 🚨 根因（探针 outputs/design/_diag_score_empty.cjs 实锤）：js/mock.js:646 用 (a.transcript || '(空)') 拼 block，
  //    P1 全未答时拼出的 block 仍非空（98 字符，因为还有 Q: 题面）→ 唯一防线 if(!block.trim()) return null 拦不住
  //    → 照样调 AI → AI 面对一屏「(空)」按默认中位给 5.5 → 总分 (5.5+P2+P3)/3 把真实水平拉平。
  //    同时 fixes 里出现根本没作答的题的编造点评（她截图里 About more than 10 years → More than 10 years）。
  // ✅ 修法（她 00:38 拍板两个口径：①未答按比例扣 FC ②整 Part 全空给最低分 4 并单列）：
  //   ① 先按实际作答筛（allQ/answered/skipped 三个计数），只把真作答的题送 AI，未答的连 block 都不进
  //   ② 整 Part 全空 → 直接返回 {fc:4,lr:4,gra:4,unanswered:true}，不调 AI、不参与总分平均
  //      （mock-report 渲染成虚线卡 +「未作答 · 不计入总分」）
  //   ③ 部分未答 → p.fc = Math.max(4, before * answered/total) 对齐 0.5 步长，只调 FC
  //      （LR/GRA 靠实际用出来的词句，答了的题不受影响），summary 里明写扣分来源
  //   ④ prompt 加 CRITICAL 规则：只评 input 里出现的题，未作答的题绝不编造点评（输入侧已过滤 + prompt 再禁一句）
  //   ⑤ 总分区标清口径「总 Band（仅含已作答的 Part · 作答 4/14 题）」+ 作答率 <60% 时黄色可信度提示
  //      （这个总 Band 只能代表你答过的那部分水平）+ 删掉死代码 partOv
  // 探针 outputs/design/_verify_mockscore_empty.cjs 18/18（旧 bug 复现 + 新逻辑 + 报告渲染口径 + 源码六项校验）
  //   + 回归 模考 35/35 · P2 18/18 · 题库 31/31。
  // ⚠️ 探针坑：MockReport.render(report) 返回 HTML 字符串、不写进 DOM（mock-report.js:168），
  //   探针要读返回值而非 #mockReport.innerHTML（第一版就踩了，4 条假 FAIL）。
  // 版本 mock.js b→20261004a · mock-report.js 20260830u→20261004a · common.css g→h（14 页全量）。SW v195→v196。

/* 核心壳预缓存清单（Node 脚本枚举目录生成，2026-09-20；与 14 页实际引用核对无遗漏）。
   不含 js/vendor/xlsx.full.min.js（861KB 体积大 → 走运行时 SWR 缓存）。 */
const PRECORE = [
  '/corpus.html',
  '/errorbook.html',
  '/index.html',      // 9/30：根 = 落地页（产品介绍），仍要能离线打开
  '/home.html',       // 9/30：学习主页由 index.html 改名而来（离线回退壳也用它）
  '/login.html',      // 10/1：独立登录页（落地页底部引导键/右上角登录键都跳这里）
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
  '/vip.html',        // 10/1 付费方案：会员中心页（价格/权益/开通流程）
  '/css/common.css',
  '/js/common.js',
  '/js/corpus.js',
  '/js/data.js',
  '/js/feedback.js',
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
  '/js/coach.js',
  '/js/timer.js',
  '/js/vip.js',
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

/* ---- 分级①：页面导航 network-first（4s 超时）→ 缓存该页 → 缓存 /home.html ---- */
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
  const shell = await caches.match('/home.html');   // 9/30：离线兜底进学习主页，不再回退落地页
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
