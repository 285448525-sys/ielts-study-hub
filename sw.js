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
const CACHE = 'ielts-hub-v168';  // 10/2 二轮审查修复：mock 模考入口竞态（bug 9）——ensureMockLib() 动态注入报告库最长有 2.5s 空窗，旧代码 startExam 在 await 之后才写 mockState、window.__mockEnter 无锁，「ready 自动续考」与「题库页手动点模考」可在空窗内并发跑起两个 runExam（双计时器/双考官/快照互踩）。修法：①新增模块级 mockEntering 锁；②resumeFromSnapshot/startExam 入口统一「if(mockEntering || mockState) return」并在第一个 await 之前同步把 mockState 就位（锁随即释放，重入改由 mockState 挡），快照为空早退复位；③终态收口：finishExam 末尾与 runExam 中断 catch 分支补 mockState=null（exitToStart 原本已有），保证考完/中断后能再开一场；④ready 的自动续考改为统一走 window.__mockEnter（不再直调 resumeFromSnapshot），所有入口同一把锁。验证：竞态探针 19/19（注入窗口内双入口连发只开一场、speak 单例证据、中断后可重开、零 pageerror/rejection）+ allpages 56/56 + appshell 56/0 + tpllock 13/13 + p0/p1 金路径各 13/13。版本 js/mock.js b→c（speaking.html；PRECORE 裸路径缓存随 SW bump 刷新）。上一版 v167 微信信息全站收口——①settings.html 删「意见反馈」卡（⑤b，含写反馈按钮 + 「也可以在「更多」菜单里找到入口」）与底部「加站长微信」一行条（wx-strip 类名 + 其内联死样式 + 孤儿注释一并清）；②js/feedback.js 弹层内新增底部急事出口：超链接「等不及回复？加站长微信」→ **原位展开**联系方式块（她选「弹窗内原位展开」而非另开弹窗/直接复制，理由：不丢已写内容、上下文连贯）；微信号写进 FB_WX 常量作为**全站唯一出口**；展开块支持点微信号即复制（clipboard API + execCommand 双通道兜底）、aria-expanded/aria-controls、每次 open 收回起态、暗色同构图；③vip.html 开通方式「加站长微信转账」改「联系站长开通（去意见反馈说明档位+账号）」+ 邀请码 FAQ + 底部独立联系方式卡三处全部去微信号（她选「全删，只留反馈 Tab 里的」；她确认会员功能暂未上线，付款路径断链无影响）；④login.html 找回密码同改走意见反馈（保留「老数据不会丢」承诺）；⑤后端 feedback.js 限频/满额提示与前端网络异常提示一律改引导「点弹层底部超链接」，不再直发微信号。CSS 新增 fb-wx*41 行（--primary-soft 浅底 + 左主色描边，微信号等宽虚线块，三个命中区 ≥44px）。验证：源码探针 65/65 + 真实浏览器交互 28/28（展开/收起/复制/已写内容不丢/不遮挡提交按钮/重开复位/暗色/移动端贴底/设置页 4 卡清单）+ allpages 56/56。版本 feedback.js a→b、common.css k→l（各 14 页）。上一版 v165 计划页措辞收尾
  // 10/2 P1 答题框架融合（她刷到的高频题型框架 DP F/DWC/DCF/OREO + 同义替换句库 + 频率四档）——①js/speaking.js P1「AI 辅助」prompt 新增【题型骨架】段：先判题型（喜好/频率习惯/童年过去/事实背景/未来愿望/细节感受）再按对应骨架组织，**只当结构骨架用，框架名严禁写进输出**（她明确：考场上不会去看用了哪个框架，框架是背后的大脑不该出现在屏幕上），也**不生成整段模板给她背**；新增【直答句同义替换表】（yes→Absolutely/Definitely、no→Not really/Definitely not、I like it→I'm really into it/I'm a big fan of it、I don't like it→I'm not that into it/It's not really my thing）和【频率四档】（almost every day/from time to time three times a week/rarely once in a blue moon/never），替换掉原「稍高级」段里仅两条的 like→be really into、good→enjoyable；②新增选填「想法」输入框 .sp-idea（每道 P1 小题一条，placeholder「想法（选填，中英文都行；填了我就按你的思路来）」）：**空着点 AI 辅助 = 与原先完全一致（AI 自己全想）；填一句中文/碎片英文再点 = prompt 里加一段【考生填了想法时的处理规则】四条（最高优先级压倒骨架：严格按她想法组织不得另起炉灶/中文混杂直接翻地道英文/只补全不偏离/逻辑链第一环对应想法核心），想法随 aiHelper.idea 落库并在重进时回填（否则退出再进来白填），结果区顶部显示「已按你填的想法生成」小标记（不显示任何框架名）；③js/materials.js 万用人设卡 8 条全部重写为「性格/成长背景/身份标签」三角度结构（正是 DPF 里P 环要用的三样，AI 辅助取素材时能直接拆出来铺回答），并给每条加 fit 字段→按钮 title 悬停提示「能撑的题」；UI 与按钮零改动，往数组加一条的约定继续有效。④speaking.html 加 .sp-idea（虚线浅底、聚焦 teal 边、已填转实线、:not(:placeholder-shown) 也转实线）与 .sp-ref-note 样式。本次**不碰 P3**（p3HelperSys/p3ReviewSys 一个字未动）——她 10/9 机考，P3 那套锚句库她已练出肌肉记忆，考前 7 天换 prompt 风险大于收益；考后再议「锚句库只有 8 条、超出类别会硬套」与「禁 for example 导致永不展开」两个已知短板（届时可用 P1 骨架里的 R/E 环补展开）。版本 speaking.js b→c、materials.js a→b（speaking.html / materials.html 两页）。另：本批 commit 前先把另一 AI 审查修好的 8 个 bug（common/speaking/writing 目标分 0 穿透、会员闸缓存作废、grammar 旧记录凭空显示、tplWrongBox 恢复漏项、大作文分组漏渲染）单独提交为 916ce20，两件事不混。上一版 v166 微信信息全站收口

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
