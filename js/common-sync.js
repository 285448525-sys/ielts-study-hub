/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 3 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== 云同步：状态与哈希 / 设备号 / 上传节流 / 多标签选举 */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */

/* ===== 云端同步（Cloudflare Pages Function + KV） =====
   10/21 起账号 = 邮箱 + 密码（/api/auth），/api/sync 凭 session token（X-Session 头）读写。
   旧「X-Sync-Key 手机号直连」通道已下线（无鉴权的安全账）。
   非 Cloudflare 部署时 /api/sync 会 404，所有调用都会优雅降级（不报错、不弹窗刷屏）。 */
/* ===== W-5（10-24）云端请求补超时 =====
   为什么要补：`authApiPost` / `syncApi` 两个 fetch 原来**没有任何超时** —— 弱网或网络挂住时
   `await` 永不返回，调用方的 finally 永不执行，按钮就永久卡在「安排中…」（她报过好几次
   「点了没反应只能刷新」）。上游也没有兜底：`common-ai.js` 那边有 withTimeout，但同步侧没有。
   做法：照抄 `js/bank.js:168` 的 AbortController 范式（本项目既有口径，不另造一套）：
     · 有 AbortController 就真中断请求；没有（极老环境）就退化成「只抛超时、请求让它自己跑完」
     · 超时错误带 code='SYNC_TIMEOUT'，让调用点原有的 catch/finally 正常解锁并提示
     · 几种方法的默认预算分开：读（GET/探测）短、写（PUT 全量上传）长 —— 上传是 1.8MB 级别的体量，
       和 GET meta 用同一个超时会误杀正常上传
   🔴 只加超时，不改任何同步口径、不改节流窗口、不改重试策略。 */
const NET_TIMEOUT_READ_MS = 15000;    // GET / meta 探测 / DELETE：读操作 15s 足够
const NET_TIMEOUT_WRITE_MS = 45000;   // PUT 全量上传：她云端数据 1.8MB 级别，弱网下要给够
const NET_TIMEOUT_AUTH_MS = 15000;    // 登录 / 改密 / vip_status：小请求，15s
function fetchWithTimeout(url, opts, ms, code){
  opts = opts || {};
  const budget = (ms && ms > 0) ? ms : NET_TIMEOUT_READ_MS;
  const tag = code || 'SYNC_TIMEOUT';
  /* 文案里不要出现「0 秒」：预算不足 1 秒时 Math.round 会抛成 0，看着像 bug。
     不足 1 秒就按「不到 1 秒」说，真实场景（15s/45s）不受影响。 */
  const secText = budget < 1000 ? '不到 1 秒' : (Math.round(budget / 1000) + ' 秒');
  if(typeof AbortController !== 'function'){
    /* 极老环境退化成「只抛超时」：用一个计时器 reject，请求本身没有 signal 可中断 */
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const e = new Error('网络响应超时（' + secText + '无响应），请重试');
        e.code = tag; e.isTimeout = true;
        reject(e);
      }, budget);
      Promise.resolve().then(() => fetch(url, opts)).then(
        r => { clearTimeout(timer); resolve(r); },
        err => { clearTimeout(timer); reject(err); }
      );
    });
  }
  const ac = new AbortController();
  const timer = setTimeout(() => { try{ ac.abort(); }catch(_){} }, budget);
  const opts2 = Object.assign({}, opts, { signal: ac.signal });
  return fetch(url, opts2).then(
    r => { clearTimeout(timer); return r; },
    err => {
      clearTimeout(timer);
      if(err && (err.name === 'AbortError' || err.code === 20)){
        const e = new Error('网络响应超时（' + secText + '无响应），请重试');
        e.code = tag; e.isTimeout = true;
        throw e;
      }
      throw err;
    }
  );
}

let _cloudTimer = null;
let _lastUploadedHash = '';
let _pendingUpload = false;
let _firstPendingAt = 0;
let _lastCloudHash = '';   // 上次拉到的云端内容哈希：相同则跳过 mergeData（性能优化，见 cloudDownload）
let _lastUploadedCloudHash = '';   // v7.1：最近一次成功上传的 payload 哈希——拉取命中它=自己刚传的回声，跳过合并不弹窗不计变更
let _bootPublishTried = false;   // ⭐ 9/19 每次页面加载只做一次「开机发布」（见 _maybePublishLocal）

/* ===== 9/30「同步很憋屈」专项：乐观锁基线 + 自适应节流 + 多标签 leader =====
 * 背景（她原话：「反正就是经常同步不上啊」「出现过同步失败或被覆盖」）：
 * 之前 PUT 是无条件整份覆盖，两台设备各自推自己的快照 = 互相抹掉对方的进度。
 * 服务端 9/30 起支持乐观锁（409），这里负责：带上 baseTs、遇到 409 先合并再重试。 */
let _cloudBaseTs = 0;      // 最后一次「已验证」的云端 ts；0 = 还不知道（此时不锁，走老语义）
let _lastPutAt = 0;        // 上次 PUT 成功时刻
let _lastChangeAt = 0;     // 上次挂起变更的时刻（用于「静默一段时间后重置节流」）
let _putGap = 6000;        // 当前两次 PUT 的最小间隔：安静时 6s，连续写盘时逐步放宽到 60s
/* ⭐ 起步 6s、每次 ×1.6、上限 60s：6 → 9.6 → 15 → 25 → 39 → 60。
   意思是「刚动第一下」基本秒到（≤10s），但如果是在连续做题/计时，一分钟内就自己退到几十秒一次，
   8 小时连续学习约 150 次 PUT —— 比旧方案还省，且再也不会出现「写盘不停就永远不传」。 */
/* ⚠️ 10/6 12:56 她决定「内测直接开 Workers Paid（$5/月 = KV 写 100 万/天）」，
   并要求「电脑有任何改动，手机立刻有反应」→ **当初为省 KV 写配额而设的「逐步退让」现在纯亏体验**。
   原值：PUT_GAP_MIN 6s / MAX 60s（连续写盘逐步退让，稳态 60s 一次 —— 这就是她体感的「越用越慢」）。
   现值：固定 1.5s，不退让。写量核对：20 人 × 一天 100 次改动 × 30 天 = 6 万次/月，
   **占 100 万额度的 6%** → 完全撑得住，不需要再为省配额牺牲速度。 */
const PUT_GAP_MIN = 1500, PUT_GAP_MAX = 1500, PUT_IDLE_RESET = 45000;

/* ⭐ 9/30 多标签页 leader 选举：同一台机器开着 3 个标签页时，只有 leader 做定时轮询。
 * 为什么需要：每个标签页各有自己的内存 DATA，各自拉各自合并，既浪费配额又互相制造冲突（409）。
 * 现在：
 *   - leader = 「前台标签优先，其次 id 最小」；一旦 leader 切到前台，会立刻接管（isLeader 变化时马上补一次探测）。
 *   - 非 leader 完全不轮询，靠 leader 广播 'poll' 通知「云端有变化」再各拉一次。
 *   - 不支持 BroadcastChannel（老浏览器）时恒为 leader —— 退化和今天一样，不会变砖。
 * 注意：上传不做 leader 限制。谁改了谁传，正确性由乐观锁保证（409 会自动合并重试）。
 * ⚠️ 必须在调用点之前初始化 —— defer 脚本的 ready() 回调可能同步执行，
 *    写在文件后段的 const 会落进 TDZ，被 catch(_){} 静默吞掉（9/26 踩过的坑）。 */
const _tabId = 't' + Math.random().toString(36).slice(2, 9);
const _syncBC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('hub-sync-v1') : null;
let _syncPeers = {};      // tabId -> { ts, hidden }
let _isLeader = true;     // 保守默认 true：单标签页时本来就该干活
function _syncElectLeader(){
  const now = Date.now();
  Object.keys(_syncPeers).forEach(k => { if(now - _syncPeers[k].ts > 12000) delete _syncPeers[k]; });
  const self = {}; self[_tabId] = { ts: now, hidden: !!(typeof document !== 'undefined' && document.hidden) };
  const all = Object.assign({}, _syncPeers, self);
  const ids = Object.keys(all).sort((a, b) => {
    const ha = all[a].hidden ? 1 : 0, hb = all[b].hidden ? 1 : 0;
    if(ha !== hb) return ha - hb;      // 前台优先
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  const was = _isLeader;
  _isLeader = (ids[0] === _tabId);
  if(_isLeader && !was && typeof _cloudPollSoon === 'function') _cloudPollSoon();   // 刚接任：立刻补一次
}
function _syncBcPing(){
  try{ if(_syncBC) _syncBC.postMessage({ t:'ping', id:_tabId, hidden: !!(typeof document !== 'undefined' && document.hidden) }); }catch(e){}
}
if(_syncBC){
  _syncBC.onmessage = function(ev){
    const m = ev.data;
    if(!m || !m.id || m.id === _tabId) return;
    if(m.t === 'ping'){ _syncPeers[m.id] = { ts: Date.now(), hidden: !!m.hidden }; _syncElectLeader(); }
    else if(m.t === 'bye'){ delete _syncPeers[m.id]; _syncElectLeader(); }
    else if(m.t === 'poll'){ try{ cloudPollOnce({ force: true }); }catch(e){} }   // leader 说云端变了
    else if(m.t === 'uploaded'){ if(!_isLeader) try{ setTimeout(cloudPollOnce, 400); }catch(e){} }   // 别的标签页传过东西：跟一次，别等到下一轮轮询
  };
}

/* ⭐ 9/19 修「两台设备数据对不上/来回跳」第二刀：开机发布。
 * 上一刀（eb5c9b9）修了「背完就传」，但只覆盖「本机刚写过」的场景；她实测又暴露出另一半：
 * 手机上滞留的独有进度（早前没传出去的那批），在「只打开页面对比、不做任何操作」时永远没有上传出口——
 * pull 合并只进不出，旧注释假设「本端独有数据会在下次操作时自然上传」，不成立。
 * 同时两台设备各自把自己的快照推上云，云端在两份快照间来回翻（她看到 2h16m→3h7m 跳变）。
 * 修法：每次页面加载的首次拉取完成（此刻 DATA=本机∪云端 并集）后，
 * 若并集与云端内容不一致（或云端为空 404）→ 立即把「并集」回传云端。
 * 云端从此只被「并集」覆盖，单调收敛不再互相踩；已收敛时内容一致→不推，不浪费 KV 配额。
 * 只在首次拉取时机做一次（30s 轮询不推），最坏情况=每次打开页面 1 次 PUT，配额无压力。 */
function _syncComparableSnapshot(src){
  try{
    const c = JSON.parse(JSON.stringify(src || {}));
    if(c && c.settings){ delete c.settings.lastSyncTs; delete c.settings.relayToken; }   // 这两个是上传动作自身的副产品，不参与「内容是否一致」判断
    return c;
  }catch(e){ return null; }
}
function _maybePublishLocal(cloudEmpty, cloudBlob){
  if(_bootPublishTried) return;
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  _bootPublishTried = true;   // 先占位再尝试：失败也不重试（下次打开页面再试），防轮询期反复推
  try{
    if(cloudEmpty){ cloudUpload(false); return; }   // 云端没数据（404）=本机就是最全的 → 直接发布
    const mine = JSON.stringify(_syncComparableSnapshot(stripCloudFields(DATA)));
    const theirs = JSON.stringify(_syncComparableSnapshot(cloudBlob));
    if(mine && theirs && mine !== theirs) cloudUpload(false);
  }catch(e){}
}

function hashData(x){
  // 简单稳定哈希：把 DATA JSON 做 djb2，够用来判断「内容是否真变了」。
  // x 可选：传云端数据则哈希云端内容（cloudDownload 用它判断「云端是否变化」）；
  // 不传则哈希当前内存 DATA（cloudUpload 判断「本机是否有实质变更」）。
  const s = JSON.stringify(x === undefined ? DATA : x);
  let h = 5381;
  for(let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return String(h);
}

/* 设备唯一标识：每台浏览器生成一次，写入 localStorage，用于云端记录来源 */
function getDeviceId(){
  let id = '';
  try { id = localStorage.getItem('hub_device_id') || ''; } catch(e){}
  if(!id){
    id = 'd' + uid();
    try { localStorage.setItem('hub_device_id', id); } catch(e){}
  }
  return id;
}

/* ===== 10/21 账号认证（邮箱 + 密码）=====
   老体系「手机号即凭证、X-Sync-Key 直连」已彻底下线（那正是本次要还的安全账）。
   现在：/api/auth email_code/email_register/login/change/email_reset/logout，/api/sync 只认 session token。
   10/21 她拍板「只能邮箱登录」→ 手机号/用户名注册登录前后端全删，账号只有邮箱一种形态。
   token 存 localStorage['hub_auth_token']（绝不进 DATA——DATA 会整份上云）；
   DATA.settings.syncCode 继续当「账号标识」用（大量旧逻辑读它），由登录流程写入（现在是邮箱）。
   忘记密码走「邮箱验证码重置」（email_reset）。 */
const AUTH_TOKEN_KEY = 'hub_auth_token';
function authToken(){ try{ return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }catch(e){ return ''; } }

/* ===== 会员状态统一查询（10/6 20:55 她报「我明明是 VIP 号，它给我锁了」）=====
   🔴 病根：老口径把「查不出来」和「不是会员」混成同一个 false，还写进 sessionStorage。
   一次网络抖动 / Worker CPU 超限（10/5 的 1101）/ 401 → 永久记成 '0'，
   而 sessionStorage 跨刷新存活 → 锁卡上写的那句「刷新本页」永远刷不掉这个 '0'；
   同时 vip.html 是实时查的 → 会员页写着「永久会员」、写作页锁着，自相矛盾。
   ✅ 现在口径（三条铁律）：
   ① 查失败 = null（未知），**绝不等于 false**；调用方对 null 走「先解锁再复查」而不是锁死。
   ② 缓存带时间戳，TTL 5 分钟自动过期 —— 不需要登出/换号也能自愈。
   ③ force=true 跳过缓存直查（锁卡上的「重新检测」按钮 / 页面从后台切回时用）。 */
const VIP_FLAG_KEY = 'hub_vip_flag_v1';
const VIP_FLAG_TTL = 5 * 60 * 1000;
function vipFlagClear(){ try{ sessionStorage.removeItem(VIP_FLAG_KEY); }catch(e){} }
function setAuthToken(t){
  try{
    if(t) localStorage.setItem(AUTH_TOKEN_KEY, t); else localStorage.removeItem(AUTH_TOKEN_KEY);
    /* 10/2 修：登录态一变（登录/登出/401 过期都走这里），会员状态缓存必须作废。
       否则同标签卡登录会员后「刷新本页」仍命中旧的 '0' 被锁（锁卡指引失效）；
       登出/换号后又会命中旧的 '1' 保持解锁（会员锁被绕过）。 */
    vipFlagClear();
  }catch(e){}
}

/* 返回 true / false / null(未知)。ttlMs 缺省 5 分钟；force=true 跳过缓存直查。 */
async function authVipCheck(force, ttlMs){
  const ttl = (typeof ttlMs === 'number') ? ttlMs : VIP_FLAG_TTL;
  if(!force){
    try{
      const raw = sessionStorage.getItem(VIP_FLAG_KEY);
      if(raw){
        const o = JSON.parse(raw);
        /* 老版本写的是裸 '0'/'1'（无时间戳）→ 认作过期，重新查，避免继续沿用坏值 */
        if(o && typeof o.t === 'number' && typeof o.v === 'boolean' && (Date.now() - o.t) < ttl){
          return o.v;
        }
      }
    }catch(e){}
  }
  if(typeof authToken !== 'function' || !authToken()) return false;   // 确实没登录 = 确定非会员
  let isVip = null;
  let vipExp = null;   // 🔴 W-UI-1（10-26）：顺手把 expire 一起缓存 —— 消息中心「会员还有 N 天到期」
                       //    要天数，而这里原本只存布尔；不缓存就得为拿天数再发一次请求，
                       //    违反消息中心「零接口」的口径。复用这一次响应，不新增任何请求。
  try{
    const j = await authApiPost({ action:'vip_status', token: authToken() });
    if(j && j.ok !== false){
      isVip = !!(j.vip && j.vip.expire);
      if(isVip) vipExp = j.vip.expire;
    }
  }catch(e){ isVip = null; }   /* 🔴 查失败 = 未知，不写缓存、不当非会员 */
  if(isVip !== null){
    try{ sessionStorage.setItem(VIP_FLAG_KEY, JSON.stringify({ v: isVip, t: Date.now(), expire: vipExp })); }catch(e){}
  }else{
    vipFlagClear();   // 失败不留任何缓存，下次进页面重新查
  }
  return isVip;
}
/* W-UI-1（10-26）：读 authVipCheck 缓存里的 expire（毫秒或 YYYY-MM-DD），不缓存/非会员/已过期
   缓存都返回 null。🔴 只读不请求 —— 没缓存就返回 null，调用方（消息中心）按「无这条提醒」处理，
   等下一次正常的会员检查跑完自然就有了。返回值结构见 vip.js:236 的 expire 两形态兼容。 */
function hubVipExpireCached(){
  try{
    const raw = sessionStorage.getItem(VIP_FLAG_KEY);
    if(!raw) return null;
    const o = JSON.parse(raw);
    if(!o || o.v !== true || !o.expire) return null;
    if(typeof o.t !== 'number' || (Date.now() - o.t) > VIP_FLAG_TTL) return null;
    return o.expire;
  }catch(e){ return null; }
}

async function authApiPost(payload){
  let res = null;
  try{
    res = await fetchWithTimeout('api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, NET_TIMEOUT_AUTH_MS, 'AUTH_TIMEOUT');
  }catch(e){
    /* 🔴 W-5：超时也要说人话。原来一律吞成「网络异常，稍后再试」，
       超时和断网在她眼里是同一句，排障时没法区分。 */
    if(e && e.isTimeout) throw e;
    throw new Error('网络异常，稍后再试');
  }
  let j = null;
  try{ j = await res.json(); }catch(_){}
  if(!res.ok || !j || !j.ok){
    const e = new Error((j && j.msg) || ('请求失败（HTTP ' + res.status + '）'));
    e.code = (j && j.error) || 'AUTH_FAIL';
    e.status = res.status;
    throw e;
  }
  return j;
}

/* 统一的云端请求封装：自动带 X-Session 头（session token）。
   path 可选：'/?meta=1' 之类的附加查询串（9/30 轻量探测用）。
   返回 [Response, json] 二元组，调用方自行判断 status。 */
async function syncApi(method, body, path){
  const headers = { 'Content-Type': 'application/json' };
  const tok = authToken();
  if(tok) headers['X-Session'] = tok;
  const opts = { method, headers };
  if(body) opts.body = JSON.stringify(body);
  /* 🔴 W-5：写操作（PUT 全量上传）与读操作给不同预算 —— 她的云端 1.8MB 级别，
     和 ?meta=1 探测共用 15s 会误杀正常上传（HOTFIX 时代踩过一次「上传到一半被判失败」）。 */
  const isWrite = String(method || '').toUpperCase() === 'PUT' || String(method || '').toUpperCase() === 'POST';
  const res = await fetchWithTimeout('/api/sync' + (path || ''), opts,
    isWrite ? NET_TIMEOUT_WRITE_MS : NET_TIMEOUT_READ_MS, 'SYNC_TIMEOUT');
  let data = null;
  try { data = await res.json(); } catch(e){}
  return [res, data];
}

/* ⭐ 9/30 重写「什么时候真的上传」——解决「改完另一头要等很久」。
 * 旧口径：debounce 60s + maxWait 3min。意思是连续写盘时最长要 3 分钟才落地，
 *        她体感就是「背完了另一台设备上看不到」。当时这么保守是担心 KV 写配额（1000/天）。
 *        实测她的写量只有几十次/天，配额根本碰不到 —— 真正稀缺的是「及时」，不是省钱。
 * 新口径（三层）：
 *   1) 合并窗口 2.5s：连着改几下算一次，避免一次点击发好几个 PUT。
 *   2) 最小上传间隔 _putGap：空闲后第一次改动 8s 内必达；同一次连续学习里逐步放宽到 60s。
 *      →  bursts 不炸配额（最密 8s 一次，理论上限约 450 次/小时，只在疯狂连点时出现），
 *         稳态退化为 60s 一次，8 小时连续学习 ≈ 30~60 次，配额压力小于旧方案的零散突发。
 *   3) 硬上限 90s：任何情况下有变更不会超过 90s 不上传。
 * 另外加宽到 macrotask 之外：首次改动后立刻排定时器，不等下一次写盘。
 */
const CLOUD_DEBOUNCE = 1000;   // 10/6 2.5s → 1s：体感「立刻」，仍能压掉连续点击
const CLOUD_MAX_WAIT = 6 * 1000;   // 10/6 90s → 6s：任何情况都不会「改了半小时才上去」
function scheduleCloudUpload(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  const now = Date.now();
  // 静默超过 45s 后重新开始改 → 节流档位重新从最快开始（ responsiveness 优先）
  if(_lastChangeAt && now - _lastChangeAt > PUT_IDLE_RESET) _putGap = PUT_GAP_MIN;
  _lastChangeAt = now;
  if(!_pendingUpload){ _pendingUpload = true; _firstPendingAt = now; }
  if(_cloudTimer) clearTimeout(_cloudTimer);
  let target = Math.max(_lastPutAt + _putGap, now + CLOUD_DEBOUNCE);
  if(target > _firstPendingAt + CLOUD_MAX_WAIT) target = _firstPendingAt + CLOUD_MAX_WAIT;
  const wait = Math.max(0, target - Date.now());
  _cloudTimer = setTimeout(function(){
    // 到点才发现距离上次 PUT 还不够久（被 maxWait 提前叫醒）→ 再睡够剩下的时间，绝不放宽节奏
    const gapLeft = _lastPutAt + _putGap - Date.now();
    if(gapLeft > 0){ _cloudTimer = setTimeout(function(){ cloudUpload(false); }, gapLeft + 30); return; }
    cloudUpload(false);
  }, wait);
}
/* showToast 是否提示；force 是否跳过「内容未变化」早退；opts.noLock 跳过乐观锁（重置/强制覆盖云端时用） */
async function cloudUpload(showToast, force, opts){
  showToast = showToast !== false;
  opts = opts || {};
  /* 10/8 导航优先：自动上传（showToast=false 的定时触发）在切页瞬间让路，导航结束自动重排；
     手动「立即同步」（showToast=true）是用户明确动作，不拦。
     🔴 AUDIT-D1-2（10-28）补一个例外：opts.noGrace —— 「清空数据补传」（hub_reset_pending）
        必须在软导航当场推上去。那条补传是数据安全级的：它一旦被导航让路推迟，
        导航宽限窗口一过就轮到 3s 轮询把云端旧数据拉回来合并，她刚清空的记录原地复活。
        所以它是唯一该插队让路的上传，且带 noLock（刻意用空数据覆盖云端）。 */
  if(showToast === false && !opts.noGrace && navBusyGrace()){ _pendingUpload = true; scheduleCloudUpload(); return false; }
  _pendingUpload = false;
  const phone = DATA.settings.syncCode;
  if(!phone){ if(showToast) toast('请先登录（设置 → 云端同步）'); return false; }
  if(!authToken()){ if(showToast) toast('登录已过期，请到「设置 → 云端同步」重新登录'); return false; }
  // 先给本机改过的条目打 updatedAt（可能改 DATA），hash 必须在打戳之后再算，
  // 否则同一次修改会被判两次「有变化」。见 stampSyncItemsForUpload 的说明。
  stampSyncItemsForUpload();
  const h = hashData();
  if(h === _lastUploadedHash && !force){
    // 数据自上次成功上传后没有实质变化，跳过本次 PUT，节省 KV 写入次数
    if(showToast) toast('数据未变化，无需上传');
    return true;   // 内容与云端一致，视为成功
  }
  try{
    /* DATA-1（10-26）：上传前先确保口语题库已到位 —— 未到位时 stripCloudFields 会把 speaking 摘掉，
       而服务端 PUT 是**整份覆盖**，那一次上传就会把云端那份题库（含她的答案）抹掉。
       题库通常在页面可用后 1~3s 内就拉到了，这里最多等一下（加载失败/离线时 ensureStatic 立刻返回 false，
       继续走，闸① 继续兜底）。 */
    if(typeof HUB_FACTORY !== 'undefined' && HUB_FACTORY && typeof HUB_FACTORY.ensureStatic === 'function' && !HUB_FACTORY.readyStatic){
      try{ await HUB_FACTORY.ensureStatic(); }catch(e){}
    }
    const _payload = stripCloudFields(DATA);   // v7.1：先落变量——成功后记它的哈希做「自回声」基线
    const putBody = { data: _payload, ts: Date.now(), deviceId: getDeviceId() };
    // ⭐ 乐观锁：已知云端版本才带 baseTs（0=还不知道 → 不带，维持老的无条件覆盖语义）
    if(_cloudBaseTs && !opts.noLock) putBody.baseTs = _cloudBaseTs;
    const [res, body] = await syncApi('PUT', putBody);
    if(res.status === 404) throw new Error('云端未启用（需先部署 Functions）');
    if(res.status === 503) throw new Error('云端存储未绑定（Cloudflare 后台需绑定 SYNC_KV）');
    if(res.status === 401){
      setAuthToken('');   // token 已失效，清掉让设置页显示「需要登录」；本机数据绝不动
      throw new Error('登录已过期，请到「设置 → 云端同步」重新登录');
    }
    if(res.status === 409){
      // ⭐ 9/30 核心修复：期间有别端（另一台设备 / 另一个标签页）写过。
      //    绝不硬覆盖——先把它拉下来合并，再基于新版本重试。最多 2 次，防死循环。
      const tries = (opts.retry || 0) + 1;
      if(tries <= 2){
        /* SET-GROW-1（10-27 她二次报障）：这句瞬时进度**不许写进 #syncStatus** ——
           文本一出现身份卡就长高、消失又缩回，她每次开设置页都看到「突然变长一下」。
           进度类一律走 toast（全站现成件），状态行只留 error 与真正的结果。 */
        if(window.toast) window.toast('云端有新版本，先合并再上传…');
        const dl = await cloudDownload(true);
        // cloudDownload 已把 _cloudBaseTs 更新到服务端最新 ts
        if(dl) return await cloudUpload(showToast, true, { retry: tries, noLock: opts.noLock });
      }
      throw new Error('云端在此期间被其他设备更新，已自动重试仍未成功，请点「立即同步」再试一次');
    }
    if(!res.ok){
      const detail = body && body.error ? body.error : ('HTTP ' + res.status);
      throw new Error(detail);
    }
    DATA.settings.lastSyncTs = Date.now();
    _lastUploadedHash = hashData();   // ⭐ 9/19：成功后重算基线——lastSyncTs 在上传成功瞬间自变化，沿用上传前快照 h 会让下次比对永远失配，hash 去重形同虚设
    _lastUploadedCloudHash = hashData(_payload);   // v7.1：自回声基线（云端存的就是这份，下次拉到相同哈希=自己传的，不再当「云端更新」合并）
    _lastPutAt = Date.now();
    _putGap = PUT_GAP_MIN;   // 10/6：不再退让（已开 Paid，写量有余）；固定 1.5s
    // PUT 成功即等于「云端此刻的内容已知」：下一次 PUT 可以直接当乐观锁基线，
    // 轮询也可以直接短路（省掉一次全量下载）
    if(body && body.ts) _cloudBaseTs = Number(body.ts) || _cloudBaseTs;
    if(body && body.hash) _lastCloudHash = String(body.hash);
    if(_syncBC){ try{ _syncBC.postMessage({ t:'uploaded', id:_tabId }); }catch(e){} }
    if(showToast) toast('已上传到云端');
    /* SYNC-NOOK-1（10-27）：上传成功**不再往身份卡写常驻绿勾**。
       她 10:1x 指截图：「把设置页这个绿色的打钩去掉，不用显示这个东西。」
       依据同她 10/5 的同类口径——「已登录旁边自动同步开，这句话不用显示，反正都是默认开着的」：
       **成功是默认预期，不必常驻告诉她**；瞬时反馈已由上面那句 toast 承担。
       注意：syncSetStatus 本体与错误通道一律不动（别的调用点还要用）。 */
    syncSetStatus('', 'ok');
    renderLastSync();
    return true;
  }catch(e){
    const size = Math.round(JSON.stringify(DATA).length / 1024);
    const msg = e.message + '（本机数据约 ' + size + ' KB）';
    if(showToast) toast('云端上传失败：' + msg);
    syncSetStatus('同步失败：' + msg, 'error');
    renderLastSync();
    // 失败后恢复未传标记：beforeunload/切后台时 flushCloudUpload 仍会用 sendBeacon 尽力补传；
    // 否则失败即清标记，本批改动既无提示也无任何补传通道（静默丢失窗口）。
    // 同时把 maxWait 锚点推到「现在」，避免失败后 _firstPendingAt 一直超时 → 每次 hubSave 立刻重试、刷爆配额。
    _pendingUpload = true;
    _firstPendingAt = Date.now();
    return false;
  }
}
/* 页面关闭/切后台前，若还有未上传的变更，尽量上传一次。
   sendBeacon 限制约 64KB，无法携带自定义头，故把 session token 放 URL 参数 session=（sync.js 兼容）。
   数据超过 60KB 时不在 beforeunload 中强传（会失败或阻塞），下次打开页面后 60s 内会自动补传，
   或用户可手动点「立即同步到云端」。 */
function flushCloudUpload(){
  if(!_pendingUpload) return;
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  const tok = authToken();
  if(!tok) return;   // 未登录：无凭证可传
  try{
    stampSyncItemsForUpload();   // 关页/切后台补传也要先打戳，保证云端拿到时间戳
    const _payloadObj = { data: stripCloudFields(DATA), ts: Date.now(), deviceId: getDeviceId() };
    const payload = JSON.stringify(_payloadObj);
    if(payload.length > 60 * 1024) return; // sendBeacon 传不了，交给下次自动上传或手动同步
    navigator.sendBeacon('/api/sync?session=' + encodeURIComponent(tok), new Blob([payload], { type: 'application/json' }));
    try{ _lastUploadedCloudHash = hashData(_payloadObj.data); }catch(e){}   // v7.1：beacon 也记自回声基线
  }catch(e){}
}
window.addEventListener('beforeunload', flushCloudUpload);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden) return;
  // ⭐ 9/19 修「换设备背词丢一截」：切后台时若数据超过 60KB（整库词库必然超过），
  // flushCloudUpload 的 sendBeacon 会静默放弃 → 最后一批改动永远上不了云。
  // 改为直接异步 PUT：切后台页面仍存活，fetch 能正常完成；成功后 _pendingUpload 清零，
  // beforeunload 的 sendBeacon 兜底自动跳过（天然防双传）；失败则恢复 pending 交给下次。
  if(_pendingUpload && typeof cloudUpload === 'function'){ try{ cloudUpload(false); }catch(e){} return; }
  flushCloudUpload();
});
/* ===== 字段级合并（替代整份覆盖，避免双设备互相抹掉进度） ===== */
/* ===== 🔴 D-2（10-24）同步字段「事实清单」分裂在两个文件里，各管一半 =====
   本清单（SYNC_ARRAY_FIELDS）只覆盖走 `common-merge.js` 的 `_mergeArray()` **通用**逻辑的字段。
   ⚠️ 另有 6 类在 `js/common-merge.js` 的 `mergeData()` 里**单独**合并 —— 它们不在这里，
      但同样是跨设备同步的正式成员。只读本清单会误以为「单词不同步」（那可是全站最关键的同步数据）。

   | 字段 | common-merge.js 里的合并函数 | 规则一句话 |
   |---|---|---|
   | `words`      | `_mergeWords()`      | 按 `en` 大小写不敏感，逐字段取「更掌握」的那份 |
   | `plans`      | `_mergePlans()`      | 按 `date` + item `id` 取并集 |
   | `checkins`   | （Set 去重）         | 日期字符串去重取并集 |
   | `materials`  | `_mergeMaterials()`  | 素材卡按 `id` 取并集 |
   | `coachMem`   | （上限 40）          | AI 陪练长期记忆按 `text` 取并集，最多 40 条 |
   | `activeTimer`| `_mergeActiveTimer()`| 按 `timerId` + 心跳 `lastBeat` 取更新的那份 |

   🔴 **加/改/删任何同步字段时，两个文件都要看**：在本清单加一项 ≠ 它就会被正确合并
      （那 6 类各有专用规则，塞进 SYNC_ARRAY_FIELDS 走通用 `_mergeArray` 会破坏它们的规则、直接丢数据）；
      反过来在 common-merge.js 新增专用合并，也要回来这里补一行注释，否则下一个人又会漏。
   本段**只加注释**，一行逻辑都没动（那些专用合并逻辑是能跑的）。 */

/* plans/checkins 已改为特判合并（_mergePlans / Set 去重），不在通用数组里 */
/* 同步字段白名单（个人数据，跨设备合并）。
 * ⚠️ 写作模板(writing)仍是官方共享题集，不进同步（避免手动删模板被另一端覆盖）。
 * ⚠️ 口语题库(speaking)【现已纳入同步】——用户要求口语串题答案/练习记录跨设备恢复。
 *    早期曾因"清缓存变101题"而剔除，但 v20260823u 已改 mergeSpeakingKeepAnswers 按id回填，
 *    不再有旧脏题库复活风险，故放开同步。合并时按 id 双向回填 answers，题干以官方为准。 */
/* ⬆️ SYNC_ARRAY_FIELDS 已前移到 js/data.js（COMMON-JS-SPLIT-1 笔 1，10-30）——
   本文件及 common-merge.js 直接读全局 window.SYNC_ARRAY_FIELDS，此处不再声明。 */
/* 上传/合并前剔除「官方共享、个人不应同步」的字段（仅 writing 模板），保持 DATA 其余逻辑不变。
 * 注意：speaking 现已纳入同步，不再剔除。 */
/* ── 写作出厂内容按需加载（2026-10-17 首屏减重第二步）──────────────────────────
   写作模板 + 起步语料已从每页必下的 js/data.js 搬到 js/factory-writing.js（约 20KB brotli）。
   ⚠️ 幂等：软导航来回切页会重复调用（10/17 口语按需加载踩过「脚本二次 append → 顶层 const
   重复声明 → 整片空白」的真回归），故用固定 id + window 上的锚点去重。 */
const FACTORY_WRITING_SRC = 'js/factory-writing.js?v=20261023b';
/* ── DATA-1（10-26）口语题库按需加载 ────────────────────────────────────────
   89 条官方题（brotli ~21KB）已从每页必下的 js/data.js 搬到 js/data-static.js：
   speaking.html 直接 <script defer> 引；其余页面由下面这个加载器在「页面可用之后」拉。
   ⚠️ 幂等：同 factory-writing —— 固定 id + window 锚点，软导航来回切页不重复 append。 */
const DATA_STATIC_SRC = 'js/data-static.js?v=20261027a';
if(typeof HUB_FACTORY !== 'undefined' && !HUB_FACTORY.loadStatic){
  HUB_FACTORY.loadStatic = function(cb){
    const done = ok => { try{ cb(ok); }catch(e){ console.error('[static] 回调异常：', e); } };
    const exist = document.getElementById('hubDataStatic');
    if(exist){
      if(HUB_FACTORY.readyStatic) return done(true);
      exist.addEventListener('load', () => done(!!HUB_FACTORY.readyStatic));
      exist.addEventListener('error', () => done(false));
      return;
    }
    if(typeof SPEAKING_BANK !== 'undefined' && SPEAKING_BANK && SPEAKING_BANK.length){
      return done(!!HUB_FACTORY.readyStatic);   // 以别的方式已在位
    }
    const s = document.createElement('script');
    s.id = 'hubDataStatic';
    s.src = DATA_STATIC_SRC;
    s.async = true;
    s.onload = () => done(!!HUB_FACTORY.readyStatic);
    s.onerror = () => { console.error('[static] 口语题库加载失败（下次会重试）'); done(false); };
    document.head.appendChild(s);
  };
}
if(typeof HUB_FACTORY !== 'undefined' && !HUB_FACTORY.loadWriting){
  HUB_FACTORY.loadWriting = function(cb){
    const done = ok => { try{ cb(ok); }catch(e){ console.error('[factory] 回调异常：', e); } };
    const exist = document.getElementById('hubFactoryWriting');
    if(exist){                                   // 已经引过（软导航/重试/静态标签）：等它就绪即可
      if(HUB_FACTORY.readyWriting) return done(true);
      exist.addEventListener('load', () => done(!!HUB_FACTORY.readyWriting));
      exist.addEventListener('error', () => done(false));
      return;
    }
    const s = document.createElement('script');
    s.id = 'hubFactoryWriting';
    s.src = FACTORY_WRITING_SRC;
    s.async = true;
    s.onload = () => done(!!HUB_FACTORY.readyWriting);
    s.onerror = () => { console.error('[factory] 写作出厂内容加载失败（下次会重试）'); done(false); };
    document.head.appendChild(s);
  };
}

function stripCloudFields(d){
  const c = Object.assign({}, d);
  delete c.writing;    // 写作模板：所有用户一致，永远用本机默认模板
  /* 2026-10-17 首屏减重第二步：出厂内容（起步语料）未到位时，本机该字段是空的 ——
     绝不能把空数组传上云，否则会造成「云端起步语料被清空」。就绪后自然恢复上传。 */
  if(typeof HUB_FACTORY !== 'undefined' && !HUB_FACTORY.fieldReady('writingPhrases')) delete c.writingPhrases;
  /* DATA-1（10-26）：口语题库（speaking）同理 —— 题库没就位时本机 speaking 是空的/旧的，
     传上云 = 把云端那 89 条题和她的答案一起清掉。就绪后自然恢复上传。 */
  if(typeof HUB_FACTORY !== 'undefined' && !HUB_FACTORY.fieldReady('speaking')) delete c.speaking;
  /* design/62：AI Key 严禁落云端。
     ⚠️ 必须先浅拷贝 settings 再删——c.settings 与 DATA.settings 是同一引用，
     直接 delete c.settings.relayToken 会把本机 Key 一起删掉，全站 AI 功能当场失效。 */
  if(c.settings && typeof c.settings === 'object'){
    c.settings = Object.assign({}, c.settings);
    delete c.settings.relayToken;
  }
  return c;
}
/* 设置里允许跨设备同步的字段。
   说明：pronunciationScore（发音分）/ fluencyScore（流利度自填分）/ theme（主题）/ chimeOnDone（完成提示音）纳入同步。
   ⚠️ relayToken（AI Key）自 design/62 起**不再同步**：上传出口 stripCloudFields 已剥离、服务端二次剥离；
   换设备 / 清缓存后需在本机重填一次 Key。理由：账号是全部凭证，Key 落云端等于额度可被凭账号取走。
   syncCode 是账号标识本身不重复同步；autoSync 是本地开关、不跨设备同步（设计：绑了账号就自动同步）。
   合并规则见 mergeData：空值（未填/被清空）永不覆盖另一侧已填值，杜绝「空值带新时间戳把本机 Key 冲掉」。 */
/* 9/26：补 practiceCfg —— 背词设置整体（每日学习上限 dailyCap / 题型 / 选项数 / 自动发音 …）
   以前不在白名单里，等于「背词设置完全不跨端」：电脑上把上限改成 200，手机仍是旧值。
   ⚠️ 必须配套：practice.js pcSave 要自己打 _fieldTs.practiceCfg，否则两端时间戳都是 0 →
   合并走「时间戳相同取云端」分支 → 本机刚改的上限会被云端旧值当场盖回去。 */
/* ⬆️ SYNC_SETTINGS_FIELDS 已前移到 js/data.js（COMMON-JS-SPLIT-1 笔 1，10-30）；上面这些字段用途注释照留。 */

/* ===== 同步条目时间戳维护（9/17 修：_mergeArray 缺时间戳导致云端修改永不并入）=====
   根因：_mergeArray 以 ts/updatedAt 判「较新者胜」，但 11 个同步数组的条目大多只有 id、
   没有任何时间戳 → tsOf 恒为 0、0>0 为假 → 本机一旦存在同 id 条目就永久压制云端，
   另一台设备的修改永远合并不进来（实测 11/11 数组复现，之之确认两台设备在用）。
   方案：上传出口按「内容指纹」检测变更条目并补 updatedAt（避开 hubSave 热路径，写盘频率太高）：
   - 首次见到（无快照）→ 只记快照不打戳，防历史老数据突然变成「最新」反过来盖掉另一端；
   - 指纹与上次不同 → 视为本机刚改 → updatedAt = now；
   - 指纹相同 → 不动（幂等，不产生无意义 PUT）。
   快照存内存 Map（不入库、不上传；指纹剔除 updatedAt/ts 自身防自指）。 */
var _syncStampSnap = new Map();
function _stampSyncItemFp(it){
  const c = Object.assign({}, it);
  delete c.updatedAt; delete c.ts;
  try { return JSON.stringify(c); } catch(e){ return null; }
}
function _stampSyncItemKey(f, it, fp){
  return f + '|' + (it && it.id != null ? ('id:' + it.id) : (it && it.ts != null ? ('ts:' + it.ts) : ('h:' + fp)));
}
/* 上传前调用：给本机改过的条目打 updatedAt。返回打戳条数。 */
function stampSyncItemsForUpload(){
  const now = Date.now();
  let touched = 0;
  for(const f of SYNC_ARRAY_FIELDS){
    const arr = DATA[f];
    if(!Array.isArray(arr)) continue;
    for(const it of arr){
      if(!it || typeof it !== 'object') continue;
      const fp = _stampSyncItemFp(it);
      if(fp == null) continue;
      const key = _stampSyncItemKey(f, it, fp);
      const prev = _syncStampSnap.get(key);
      if(prev === undefined){ _syncStampSnap.set(key, fp); }        // 首次见到：只记快照
      else if(prev !== fp){ it.updatedAt = now; _syncStampSnap.set(key, fp); touched++; }
    }
  }
  return touched;
}
/* 云端合并写回后调用：用合并结果重建快照。
   否则云端版本与本机旧快照指纹不同 → 下次上传会把云端来的条目误打上本机时间戳，
   再传回另一端形成一轮无意义覆盖与「已合并 N 处」噪音。 */
function refreshSyncStampSnap(){
  _syncStampSnap.clear();
  for(const f of SYNC_ARRAY_FIELDS){
    const arr = DATA[f];
    if(!Array.isArray(arr)) continue;
    for(const it of arr){
      if(!it || typeof it !== 'object') continue;
      const fp = _stampSyncItemFp(it);
      if(fp == null) continue;
      _syncStampSnap.set(_stampSyncItemKey(f, it, fp), fp);
    }
  }
}

/* 安全取数字：非有限数→0 */
function _num(x){ const n = Number(x); return isFinite(n) ? n : 0; }
/* 比较合并前后是否「真变化」时剔除 activeTimer 的心跳字段（lastBeat/updatedAt），
   否则另一端每 30s 轮询拉到刷新后的 lastBeat 都会被判为「已更新」→ 频繁弹「已合并 N 处」
   + 重复触发 hub:data-merged 渲染。计时本身的开始/结束（timerId/ended 变化）仍会判为变化。 */
function _stripBeat(d){
  if(!d || !d.activeTimer) return d;
  const c = Object.assign({}, d);
  c.activeTimer = Object.assign({}, d.activeTimer);
  delete c.activeTimer.lastBeat;
  delete c.activeTimer.updatedAt;
  return c;
}
/* 取更晚的日期/数值（ISO 日期串或时间戳均可；空值视为最旧） */
function _later(a, b){
  const av = (a == null || a === '') ? '' : a;
  const bv = (b == null || b === '') ? '' : b;
  return (av >= bv) ? av : bv;
}
/* 背单词：以 en（大小写不敏感）为 key，逐字段取「更掌握」状态，不丢任何一端进度。
   返回 {arr, changes}：changes = 云端新增词 + 被云端更新（更掌握/补 cn）的已有词数 */
/* 受 resetEpoch 支配的「客观进度字段」：epoch 大者整组胜出（见 words.js resetWordProgress 注释）。
   ⚠️ hardWord / keyWord 不在内——主观标注，重置也不清，永远取「或」。
   ⚠️ cn / pos / ipa 属内容字段，无论 epoch 如何都按下方取优规则合并（重构不回退释义）。 */
/* ⬆️ WORD_PROG_FIELDS 已前移到 js/data.js（COMMON-JS-SPLIT-1 笔 1，10-30）。design/77：dh/dd 随 resetEpoch 整组胜负。 */