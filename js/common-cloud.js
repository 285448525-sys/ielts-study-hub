/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 5 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== 云轮询 / 下载 / 删除 + 分数表与账号校验 + 同步面板 */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */
/* 从云端合并拉取（替代整份覆盖）。silent=true 时仅在有更新时提示，用于自动拉取 */
/* ⭐ 9/30 轮询改用「廉价探测」替代「整份下载」：
 * 服务端新增 meta 影子键（约 200B：ts / bytes / hash）。轮询先问 meta，
 * 哈希没变就直接回来 —— 不搬运那份 1.7MB、不跑 mergeData、不打扰 UI。
 * 只有真的变了才走 cloudDownload 的原合并链路。
 * ⚠️ 服务端还是旧版时会把 ?meta=1 当普通 GET（回整份）—— meta.hash 取不到 → 自动退回全量，
 *    功能不受影响，只是省不了流量。升级部署自然生效，无需开关。 */
/* 上一次轮询还没回就先跳过（自适应后最密 3 秒一次，弱网下会叠加）。
   ⚠️ 10/6 修一个自己引入的 bug：定时器是固定 3 秒一跳，但我第一版把 `gap`（3s/20s）
   只当参数传下去、**没真用来节流** → 静止时也会每 3 秒打一次，白烧读额度。
   现在改成真节流：按 opt.gap 判断「距上次探测够久了吗」，另外 `force`（手动同步/回前台）不受限。 */
let _pollInFlight = false, _lastPollAt = 0;
async function cloudPollOnce(opt){
  opt = opt || {};
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return false;
  if(!authToken()) return false;   // 未登录/已过期：轮询静默退出（401 提示由手动同步与上传链路给出）
  if(_pollInFlight) return false;
  if(navBusyGrace()) return false;   // 10/8 导航优先：切页瞬间探测让路（见 navBusyGrace 注释）
  var gap = opt.gap || 0;
  if(!opt.force && gap && (Date.now() - _lastPollAt) < gap) return false;
  _pollInFlight = true; _lastPollAt = Date.now();
  try{ return await _cloudPollInner(); } finally { _pollInFlight = false; }
}
async function _cloudPollInner(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return false;
  try{
    const [res, meta] = await syncApi('GET', null, '?meta=1');
    if(res.status === 401){ setAuthToken(''); syncSetStatus('登录已过期，请重新登录', 'error'); renderSyncState(); return false; }
    if(res.status === 404){ _maybePublishLocal(true, null); return false; }
    if(!res.ok) return false;
    // 服务端还是旧版时不认 ?meta=1，会直接回整份：那就自己算哈希去重，别白下去再拉一次
    if(meta && meta.data){
      if(meta.ts) _cloudBaseTs = Number(meta.ts) || _cloudBaseTs;
      const _ch = hashData(meta.data);
      if(_ch === _lastCloudHash || _ch === _lastUploadedCloudHash){ _lastCloudHash = _ch; return true; }
      return await cloudDownload(true);
    }
    if(meta && meta.hash && meta.hash === _lastCloudHash) return true;   // 最常见：零下载
    return await cloudDownload(true);
  }catch(e){ return false; }
}
let _pollSoonTimer = null;
function _cloudPollSoon(){
  if(_pollSoonTimer) clearTimeout(_pollSoonTimer);
  _pollSoonTimer = setTimeout(function(){ try{ cloudPollOnce({ force: true }); }catch(e){} }, 250);
}

async function cloudDownload(silent){
  const phone = DATA.settings.syncCode;
  if(!phone){ if(!silent) toast('请先登录（设置 → 云端同步）'); return false; }
  if(!authToken()){ if(!silent) toast('登录已过期，请到「设置 → 云端同步」重新登录'); return false; }
  /* 10/5 14:52：显示"正在同步"转圈（她要的行为）。⛔ 只在**首屏那次**拉取显示 ——
     12s 轮询的 cloudPollOnce 走的是 meta 探测（200B、很快），每次都闪一下会很刺眼。 */
  if(!silent) syncTipShow('正在与云端同步…');
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){
      // ⭐ 9/19：云端没数据而本机有 → 开机发布本机（原语义只提示，两台设备都只拉不推时云端永远空着）
      _maybePublishLocal(true, null);
      if(!silent) toast('云端没有该账号的数据');
      syncTipHide();   // 404 早退也要收起提示
      return false;
    }
    if(res.status === 503) throw new Error('云端存储未绑定（Cloudflare 后台需绑定 SYNC_KV）');
    if(res.status === 401){
      setAuthToken('');
      throw new Error('登录已过期，请到「设置 → 云端同步」重新登录');
    }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    if(data.ts) _cloudBaseTs = Number(data.ts) || _cloudBaseTs;   // ⭐ 9/30：记下云端版本，PUT 时当乐观锁基线
    // 性能优化：云端内容哈希未变则跳过合并（省去每次轮询的 mergeData + 两次全量 stringify 比较，
    // DATA 越大这波 CPU 越重，是「有时候卡」的头号来源；单设备用户基本用不上 10s 实时性）
    const _ch = hashData(data.data);
    /* ⛔ 10/5：三个早退出口都要隐藏提示，否则转圈会卡住不消失。
       （统一放这里逐个显式隐藏，而不是靠 finally —— 因为成功路径要"闪一下已更新"，
         finally 会立刻把它清掉，两者冲突。） */
    if(_ch === _lastCloudHash){ syncTipHide(); return true; }
    // v7.1 自回声短路：拉到的就是自己刚传上去的那份（单标签页上传后的常规轮询必然命中）
    // → 跳过 mergeData + 跳过「已合并」判定。此前它会被当「云端更新」跑一次全量合并 + 计一次
    // 「已合并 0 处更新」噪音弹窗；多标签页/双设备时表现为「每几十秒莫名其妙合并一次」。
    if(_ch === _lastUploadedCloudHash){ _lastCloudHash = _ch; syncTipHide(); return true; }
    const m = mergeData(DATA, data.data);
    // 终极保险：比较合并前后内容，真的变化才算「更新」。
    // 场景：本机比云端进步（背单词 streak/释义更掌握）时，_mergeWords 内部 changes 每次都会计，
    // 但合并结果内容与本机一致——若不比较内容，会「每次拉取都弹已合并 + reload」形成无限刷新循环。
    const reallyChanged = JSON.stringify(_stripBeat(m.data)) !== JSON.stringify(_stripBeat(DATA));
    if(reallyChanged){
      DATA = m.data; // 合并而非覆盖：保留本机进度，并入云端新增/更新
      refreshSyncStampSnap();   // 合并写回后重建时间戳快照，防云端来的条目被误打本机戳再传回去
      // 关键修复：背单词页内存中的 pq.queue 引用的是旧 DATA.words 里的对象；
      // 合并后 DATA.words 已换成新数组/副本，若不同步引用，用户继续答题改的是旧对象，
      // hubSave 保存的新数组不会包含这些修改 → 表现为「背了不计数/待学习不变」。
      if(typeof window !== 'undefined' && window.pq && Array.isArray(window.pq.queue) && Array.isArray(DATA.words)){
        window.pq.queue = window.pq.queue.map(oldW => {
          const k = String(oldW.en || '').trim().toLowerCase();
          if(!k) return oldW;
          const newW = DATA.words.find(x => String(x.en || '').trim().toLowerCase() === k);
          return newW || oldW;
        });
      }
      DATA.settings.lastSyncTs = Date.now();
      // 直接写 localStorage，不走 hubSave——避免「合并云端数据后又触发上传→另一端又拉到→乒乓刷屏」。
      // 本端独有数据会在用户下次操作（hubSave）时自然上传，无需在合并时立即回传。
      try{ localStorage.setItem(HUB_KEY, JSON.stringify(DATA)); }catch(e){}
      // v7.1：后台轮询（silent）一律不弹 toast——弹窗只留给手动同步；
      // m.changes===0 说明只是字段规范化（如 materials 补默认结构），内容零变化，手动同步也不该弹「已合并 0 处」
      if(!silent && m.changes > 0) toast('已合并云端 ' + m.changes + ' 处更新');
      document.dispatchEvent(new CustomEvent('hub:data-merged'));
      // ⭐ 9/30：告诉同机的其他标签页「云端刚刚有变化」，别各自每隔几十秒重复拉同一份 1.7MB
      if(_syncBC){ try{ _syncBC.postMessage({ t:'poll', id:_tabId }); }catch(e){} }
      // 无缝刷新：合并成功后主动重渲染当前页面，无需用户手动刷新即可看到另一端的变化。
      renderAllOnMerge();
      /* SYNC-NOOK-1（10-27）：合并成功同样**不写常驻绿勾**（同 common-sync.js 那处）。
         灭掉身份卡那条「✅ 已同步（已合并云端更新）」；「已合并 N 处」的瞬时提示照旧走下面那个 show/hide 逻辑。 */
      syncSetStatus('', 'ok');
      renderLastSync();
      /* 10/5：合并完闪一句「已更新 N 处」再消失（她要"更新完立刻覆盖"的明确反馈）。
         ⚠️ 有变化走 show+定时隐藏；**无变化/异常走 hide** —— 不能先 show 再无条件 hide，
         否则定时器被立刻清掉、"闪一下"根本不显示（我第一版就犯了这个，已修）。 */
      if(m.changes > 0 && !silent) syncTipShow('已更新 ' + m.changes + ' 处', 1600);
      else syncTipHide();
    } else if(!silent){
      toast('云端没有比本机更新的内容');
    }
    // ⭐ 9/19 开机发布：首次拉取合并完成后，DATA 已是「本机∪云端」并集；与云端不一致就回传并集
    _maybePublishLocal(false, data.data);
    _lastCloudHash = _ch;   // 记录云端内容哈希：下次拉到相同哈希直接早退，不再跑合并
    return true;
  }catch(e){
    if(!silent) toast('云端下载失败：' + e.message);
    syncSetStatus('同步失败：' + e.message, 'error');
    renderLastSync();
    syncTipHide();   // 失败也要收起提示（否则报错后还在转圈）
    return false;
  }
}
async function cloudDelete(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先登录（设置 → 云端同步）'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  if(!confirm('确定删除云端该账号的数据？此操作不可恢复。')) return;
  try{
    const [res] = await syncApi('DELETE');
    if(res.status === 404){ toast('云端未启用（需先部署 Functions）'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    toast('已删除云端数据');
  }catch(e){ toast('云端删除失败：' + e.message); }
}
/* ===== 模考估分基础设施（10/1 从 scores.js 挪入：首页冲刺卡 sprint.js 也要用，而 home.html 不加载 scores.js） ===== */

var MOCK_TYPES = {
  listening: { name:'听力', icon:'🎧', mode:'accuracy', color:'var(--mock)',
    parts:[ {label:'P1',defaultTotal:10},{label:'P2',defaultTotal:10},
            {label:'P3',defaultTotal:10},{label:'P4',defaultTotal:10} ] },
  reading:   { name:'阅读', icon:'📖', mode:'accuracy', color:'var(--vocab)',
    parts:[ {label:'P1',defaultTotal:13},{label:'P2',defaultTotal:13},{label:'P3',defaultTotal:14} ] },
  speaking:  { name:'口语', icon:'🗣', mode:'score', color:'var(--med)',
    parts:[ {label:'流利度 Fluency',weight:1},{label:'词汇 Lexical',weight:1},{label:'语法 Grammar',weight:1},{label:'发音 Pronunciation',weight:1} ] },
  writing:   { name:'写作', icon:'✏️', mode:'score', color:'var(--warn)',
    parts:[ {label:'Task 1',weight:1},{label:'Task 2',weight:2} ] }, // Task 2 权重更高
};

/* 整卷客观题（听/读）按「答对率 → 雅思 band」近似估分（9/15 IDP 官方表二次校准，
   官方整数档锚点：听力 5=16/6=23/7=30/8=35；阅读A 5=15/6=23/7=30/8=35）。
   非满分 40 制先按比例折算再查表；低于 4 题（约 2.0 以下）不估分。 */
var BAND_TABLE = {
  reading: [ [39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5] ],
  listening: [ [39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[11,4],[8,3.5],[6,3],[4,2.5] ],
};

function partIsScore(p){ return typeof p.score === 'number'; }
function partWeight(cfg, label){
  const p = (cfg.parts || []).find(x => x.label === label);
  return (p && typeof p.weight === 'number') ? p.weight : 1;
}
function estimateBand(type, correct, total){
  const tbl = BAND_TABLE[type];
  if(!tbl || !(total > 0)) return null;
  const eq = correct / total * 40;
  if(eq < 4) return null;
  for(const [min, band] of tbl){ if(eq >= min) return band; }
  return null;
}
/* 9/15 整卷「目标对个数」：目标分对应档位最低个数 + 2（上限 40） */
function targetCorrectFor(type, bandTarget){
  const tbl = BAND_TABLE[type];
  const t = Number(bandTarget);
  if(!tbl || !(t > 0)) return null;
  for(let i = 0; i < tbl.length; i++){
    if(tbl[i][1] === t){
      return Math.min(40, tbl[i][0] + 2);
    }
  }
  return null;
}
/* 判定是否为口语整卷模考记录（口语页自动存；与 mock-history.js / mock.js 保持一致）
   新版：kind==='speaking'；旧版：无 kind，但有 p1 且无数组 parts */
function isSpeakingMockRec(r){
  return r && (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1));
}

/* ===== 登录/注册/改密码/找回（服务端 /api/auth 真鉴权） ===== */

/* 登录成功共用动作：存 token、记账号、启动同步、拉云端合并（404 时开机发布上传本机） */
function applyAuthSuccess(acct, token){
  setAuthToken(token);
  DATA.settings.syncCode = acct;
  DATA.settings.autoSync = true;
  hubSave();
  _cloudBaseTs = 0;   // 新 session、云端版本未知：PUT 成功 / 拉取成功后会重新确立
  initCloudSync();    // 幂等：已启动则跳过
  Promise.resolve(cloudDownload(true)).then(function(){
    renderAllOnMerge();
    if(typeof populateSettingsForm === 'function') populateSettingsForm();
  });
  renderSyncState();
}

/* 🔴 10/21 删除（她拍板「只能邮箱登录，所有跟手机号还是用户名登录的前后端全删掉」）：
   这里原有 authLogin(acct,password) / authRegister(acct,password,inviteCode) / authFinishRegister 三个函数，
   走的是老「手机号/用户名 + 密码」通道（服务端 action:'register' 已同步删除）。
   删前全仓核对过调用方：设置页 10/3 就不调了（见 js/settings.js 注释），登录页 10/15 起自己 post
   （login.html 里直接 authApiPost），**产品代码零调用**——所以是纯删死代码，不影响任何页面。
   邮箱登录/注册全在 login.html 内完成；改密码 authChangePassword、登出 authLogout 仍保留在下方。 */

/* 修改密码（登录态）。session 保留，其他设备不受影响 */
async function authChangePassword(oldPassword, newPassword){
  if(!authToken()){ syncSetStatus('登录已过期，请重新登录', 'error'); return { ok:false }; }
  if(typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 64){
    syncSetStatus('新密码至少 6 位（最长 64 位）', 'error'); return { ok:false };
  }
  /* SET-GROW-1：进度类走 toast，不占 #syncStatus（否则身份卡瞬时变长） */
  if(window.toast) window.toast('正在修改密码…');
  try{
    const j = await authApiPost({ action:'change', token: authToken(), oldPassword: oldPassword, newPassword: newPassword });
    /* SET-GROW-1：成功=瞬时反馈，交给 toast；状态行保持空，不撑高身份卡 */
    syncSetStatus('', 'ok');
    if(window.toast) window.toast('密码已修改');
    return { ok:true };
  }catch(e){
    syncSetStatus('❌ ' + e.message, 'error');
    return { ok:false, msg:e.message };
  }
}

/* 退出登录：删云端 session + 清本地登录态。本机数据一律保留 */
async function authLogout(){
  try{ await authApiPost({ action:'logout', token: authToken() }); }catch(e){}
  setAuthToken('');
  DATA.settings.syncCode = '';
  DATA.settings.autoSync = false;
  hubSave();
  renderSyncState();
  toast('已退出登录（本机数据保留）');
}
/* 诊断：明确告诉用户后端到底卡在哪一步（不静默） */
async function syncDiagnose(){
  const phone = DATA.settings.syncCode;
  if(!phone){ syncSetStatus('请先登录（邮箱 + 密码）', 'error'); return; }
  if(!authToken()){ syncSetStatus('账号 ' + phone + ' 的登录已过期：请重新登录', 'error'); return; }
  /* SET-GROW-1：进度类走 toast；探测结果仍落 #syncStatus（那是她要读的结论，不是进度） */
  toast('正在探测云端…');
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){
      syncSetStatus('探测结果：HTTP 404 —— 云端 Functions 未启用或未部署。即 Cloudflare Pages 项目的 Pages Functions 没开启，/api/sync 不存在。需在 Cloudflare 后台确认 Functions 已启用。', 'error');
    } else if(res.status === 401){
      syncSetStatus('探测结果：HTTP 401 —— 登录已过期，请重新登录。', 'error');
    } else if(res.status === 503){
      syncSetStatus('探测结果：HTTP 503 —— 云端存储未绑定。Cloudflare Pages 项目未绑定 KV 命名空间「SYNC_KV」。需在后台 Settings → Storage/KV 绑定一个名为 SYNC_KV 的命名空间。', 'error');
    } else     if(res.ok){
      const size = Math.round(JSON.stringify(DATA).length / 1024);
      syncSetStatus('探测结果：HTTP 200 ✅ 云端连通正常。本机数据约 ' + size + ' KB。若仍显示「尚未同步」，点一下「绑定并同步」或刷新页面即可。', 'ok');
      renderLastSync();
    } else {
      syncSetStatus('探测结果：HTTP ' + res.status + '（' + ((data && data.error) || '未知错误') + '）', 'error');
    }
  }catch(e){
    syncSetStatus('探测失败：' + e.message + '（可能是网络无法访问 pages.dev，或浏览器拦了请求）', 'error');
  }
}
/* 设置页状态行（无对应 DOM 时静默） */
function syncSetStatus(msg, kind){
  const el = $('#syncStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'muted' + (kind ? ' sync-status-' + kind : '');
}
/* 设置页同步状态概览（三态：未登录 / 有账号未设密码（迁移）/ 已登录） */
function renderSyncState(){
  const el = $('#syncState');
  if(!el) return;
  const phone = DATA.settings.syncCode || '';
  if(!phone){ el.textContent = '尚未绑定账号'; renderLastSync(); return; }
  if(!authToken()){ el.textContent = '账号 ' + phone + '：登录已过期，重新登录后才能同步'; renderLastSync(); return; }
  /* 10/5 她 14:29：「已登录已登录，它旁边这个自动同步开，这句话不用显示，反正都是默认开着的」
     → 删掉「（自动同步：开/关）」。**但「关」的情况不能静默消失** —— 那是有用信息，
     只在真的关掉时才提示（否则用户以为同步开着其实没开）。 */
  el.textContent = '已登录：' + phone + (DATA.settings.autoSync ? '' : ' · 自动同步已关闭');
  renderLastSync();
}
/* 上次同步时间（可读） */
function renderLastSync(){
  const el = $('#lastSyncTs');
  if(!el) return;
  const ts = DATA.settings.lastSyncTs;
  el.textContent = ts ? ('上次同步：' + new Date(ts).toLocaleString('zh-CN')) : '尚未同步';
}
/* 强制：本机覆盖云端（无视合并，直接 PUT 整份）
   ⭐ 9/30 noLock：用户明确要本机覆盖，跳过乐观锁（否则会被 409 拦回去先合并，与本按钮语义相反） */
function syncForcePush(){
  if(!DATA.settings.syncCode){ toast('请先登录'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  cloudUpload(true, true, { noLock: true });
  setTimeout(renderLastSync, 1800);
}
/* 强制：云端覆盖本机（GET 后整体替换，不保留本机独有数据） */
async function syncForcePull(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先登录'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  if(!confirm('⚠️ 此操作将用云端数据替换本机所有数据（含素材），本机未同步的内容会丢失！确定继续？')) return;
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){ toast('云端没有该账号的数据'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    // h 类防御：云端数据理论上只缺 writing（官方模板 stripCloudFields 剔除后从不上传）；
    // 若云端数据异常缺 settings/words 等骨架字段，直接覆盖会让全站无 settings 可用（变砖）→ 拒绝执行。
    if(!data.data.settings || !Array.isArray(data.data.words)) throw new Error('云端数据不完整（缺 settings/words），已取消覆盖以保护本机数据');
    const _keepWriting = DATA.writing;
    DATA = data.data;
    // 2026-10-17：判空要看长度 —— 出厂内容未就绪时本机 writing 是 []（真值），旧写法 ![] 为 false 会把它留下、
    // 反而丢掉本机官方模板。就绪后再由模板迁移补齐缺失条目。
    if((!DATA.writing || !DATA.writing.length) && _keepWriting && _keepWriting.length) DATA.writing = _keepWriting;   // writing 永远用本机官方模板
    DATA.settings.lastSyncTs = Date.now();
    hubSave();
    toast('已用云端数据覆盖本机');
    setTimeout(() => location.reload(), 800);
  }catch(e){ toast('云端拉取失败：' + e.message); }
}

/* 合并成功后无缝重渲染当前页：优先调用页面注册的渲染入口；未注册则退回「调用已知 render 函数名」。
   目的：另一台设备保存的变更合并进来后，本端页面自动刷新、无需手动刷新。 */
function renderAllOnMerge(){
  // 1) 页面主动注册的渲染器（推荐，精确）
  if(Array.isArray(window.__hubRenderers)){
    window.__hubRenderers.forEach(fn => { try{ fn(); }catch(e){} });
  }
  // 2) 退回：调用各页面可能存在的全局 render 入口（命名各异，存在才调）
  ['render','renderList','renderWords','renderMeds','renderHistory','renderMock',
   'renderSyncState','renderPlan','renderPlanList','renderMaterials','renderStory',
   'renderCorpus','renderErrorbook','renderScores','renderTimer','renderDaily',
   'renderHome','renderReports'].forEach(name => {
    try{ if(typeof window[name] === 'function') window[name](); }catch(e){}
  });
}
/* 自动双向同步：启动静默合并拉取一次 + 定时/回到页面时拉取（均为合并，不覆盖、不弹确认刷屏） */
let _cloudSyncStarted = false;
/* ===== 同步指示器（10/5 14:52 她要：打开立刻看本机内容 + 转圈提示「还在更新」+ 更新完自动覆盖）=====
   ⚠️ **先澄清事实再改**：首屏拉取**本来就是非阻塞的**（下面 initCloudSync 用
      `requestIdleCallback(..., {timeout:2000})` + 800ms 兜底），页面 DCL 实测 217~341ms。
      她感受到的 4 秒 = 早就在看本机内容了，**只是没有任何"正在更新"的提示**，像是卡住。
      所以本批**只加提示，不动同步时序** —— 时序是"检查与计数同链"级别的敏感区（P0 的教训），不动它。
   用法：syncTipShow('正在与云端同步…') / syncTipHide()。元素懒建、幂等。
   ⚠️ 弱网时可能长时间转圈 → 加 12s 自动隐藏兜底，绝不让提示常驻挡路（它 pointer-events:none 也不挡点击）。 */
let _syncTipEl = null, _syncTipTimer = null, _syncTipOn = false;
function syncTipEnsure(){
  if(_syncTipEl) return _syncTipEl;
  let el = document.getElementById('hubSyncTip');
  if(!el){
    el = document.createElement('div');
    el.id = 'hubSyncTip';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = '正在与云端同步…';
    document.body.appendChild(el);
  }
  _syncTipEl = el;
  return el;
}
function syncTipShow(text, holdMs){
  if(!text) return;
  try{
    /* 🔴 10/20 模考锁：模考中不弹「正在与云端同步…」提示。
       它是 fixed 底部条（bottom:26px，正好压在模考底栏题号行上），
       而且云同步是定时触发的 → 她正答着题，底下突然冒一条又消失 =「页面乱动」。
       同步照跑（不阻断），只是不打扰。 */
    if(typeof hubExamLocked === 'function' && hubExamLocked()) return;
    if(document.body && document.body.classList.contains('hub-exam-locked')) return;
    const el = syncTipEnsure();
    if(text) el.textContent = text;
    el.classList.add('on');
    _syncTipOn = true;
    clearTimeout(_syncTipTimer);
    // 兜底：弱网/云端卡住时 12s 后自动消失，绝不常驻挡路
    _syncTipTimer = setTimeout(syncTipHide, holdMs || 12000);
  }catch(e){}
}
function syncTipHide(){
  try{
    clearTimeout(_syncTipTimer);
    if(_syncTipEl) _syncTipEl.classList.remove('on');
    _syncTipOn = false;
  }catch(e){}
}

function initCloudSync(){
  if(_cloudSyncStarted) return;   // 幂等：登录后补调用 / 重复 ready 都不重复起轮询
  if(!DATA.settings.autoSync || !  DATA.settings.syncCode) return;
  if(!authToken()) return;   // ⭐ 10/1：无 session token（迁移老用户还没设密码）不启动云同步，设完密码 applyAuthSuccess 会再调进来
  _cloudSyncStarted = true;
  // 清空数据补传：resetData 时若云端上传失败（断网），本地已空、云端仍是旧数据，
  // 此时若先拉取会把旧数据整份合并回来复活。有补传标记则先强制推空、跳过本次首屏拉取（30s 轮询保留）。
  let skipFirstDownload = false;
  try{
    if(localStorage.getItem('hub_reset_pending') === '1'){
      localStorage.removeItem('hub_reset_pending');
      skipFirstDownload = true;
      Promise.resolve(cloudUpload(false, true, { noLock: true })).then(ok => {
        if(ok === false){ try{ localStorage.setItem('hub_reset_pending', '1'); }catch(e){} }   // 仍失败：重记标记，下次启动再补传
      });
    }
  }catch(e){}
  // 优化：首屏拉取延迟到首屏渲染之后，避免「下载+合并大数组」阻塞首屏（数据越大越明显）。
  // 10s 轮询与切回前台拉取保留原逻辑。
  if(!skipFirstDownload){
    if(typeof requestIdleCallback === 'function') requestIdleCallback(function(){ cloudDownload(true); }, { timeout: 2000 });
    else setTimeout(function(){ cloudDownload(true); }, 800);
  }
  /* ⭐ 9/30 leader 心跳 + 轮询改道：
   * - 每 4s 广播一次 ping（前台/后台状态），12s 收不到就认为对方已关 → 自动重新选举。
   *   所以「唯一的标签页」永远是 leader，绝不会出现「没人干活 → 同步彻底停摆」。
   * - 轮询只由 leader 执行，且从整份下载降级为 200B 的 meta 探测，因此 30s → 12s 也不增加负担。
   * - 非 leader 靠 leader 的 'poll'/'uploaded' 广播被动跟进；切前台/回来还会再补一次。 */
  _syncBcPing();
  _syncElectLeader();
  setInterval(function(){ _syncBcPing(); _syncElectLeader(); }, 4000);
  /* 10/6 14:10 她要求「电脑有任何改动，手机就立刻有反应」→ 轮询 12s 改自适应：
       · 刚操作过（2 分钟内有改动）→ **3 秒**（她正在用手机的时段，延迟要贴近 0）
       · 静止超过 2 分钟 → **20 秒**（省读额度；反正在看的页面才会通知她）
       · 页面隐藏 → 不轮询（回前台时 visibilitychange 会立刻问一次 → **打开就是最新的**）
     ⚠️ 读额度核对（每次 meta 探测 = 1 次 KV 读；免费版 10 万/天、Paid 33 万/天）：
       平均约 15 秒/次 → 20 人 ≈ **11.4 万次/天** → Paid 占 35% 安全；免费版会略超，
       所以她已决定内测就开 Paid（$5/月）。
     ⚠️ 为什么不用「真推送」：成熟产品（Docs/Notion）用 WebSocket，那是服务器主动推；
        **KV 没有发布订阅能力**，纯 KV 拿不到推送 → 业界在这个约束下就是「短轮询 + 304 影子键」，
        本站的 `meta:` 影子键就是 304 的等价物（未变时只读 200B，不下 1.7MB 全量）。 */
  setInterval(function(){
    if(document.hidden || !_isLeader) return;
    var idle = _lastChangeAt && (Date.now() - _lastChangeAt > 120000);
    cloudPollOnce(idle ? { gap: 20000 } : { gap: 3000 });
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if(document.hidden) return;
    _syncBcPing();
    if(_isLeader) cloudPollOnce({ force: true });   // 回到前台立刻问一次（200B），不用等下一轮
  });
  window.addEventListener('beforeunload', function(){ try{ if(_syncBC) _syncBC.postMessage({ t:'bye', id:_tabId }); }catch(e){} });
}
/* ⚠️ 10/19 回归修复（外壳拆分引入）：这里**不能**写 `ready(initCloudSync)`。
   拆成 7 块之前，`ready` 与这一行同在一个 common.js —— 函数声明会提升，
   所以 3209 行调用时 `ready` 已经存在，谁来读都看不出问题。
   拆成 7 块后提升不再跨文件，而本块（common-cloud.js = 第 5 块）**先于**
   声明它的 common-shell.js（第 6 块）加载 → 19 个页面全部抛
   「ready is not defined」，initCloudSync 从未执行（云同步自动启动失效）。
   实证：拆分前 function ready 在 3214 行、本行 3209 行（靠提升才成立）；
   线上 bank/home/settings 三页均已复现该报错。
   修法（她 10/19 拍板的最小改动）：不用 ready，直接内联等价的就绪判断 ——
   行为与 ready 完全一致（文档已就绪则同步跑，否则等 DOMContentLoaded），
   但不再依赖任何跨文件加载顺序。 */
if (document.readyState !== 'loading') initCloudSync();
else document.addEventListener('DOMContentLoaded', initCloudSync);