/* === 会员中心（10/1 付费方案第一批） ===
   页面骨架在 vip.html，本文件只管两件事：
   ① 按 Pricing.VIP_PLANS 渲染价格卡（10/12 起价格数据已移至 js/pricing.js —— 全站唯一前端来源）
   ② 实时查 /api/auth vip_status 渲染顶部状态卡（会员跟账号走，不缓存本地——过期状态必须准）
   ⚠️ 改价请改 js/pricing.js，本文件禁止再出现价格字面量（tests/_probe_price_ref_1012.cjs 钉住）。 */

/* 免费额度口径：已移至 pricing.js（FREE_AI_DESC）。
   🔴 不能在此再声明同名 const —— pricing.js 与本文件在同一全局作用域，重复 const 声明会直接
   让整个 vip.js 挂掉（10/12 实踩：卡片/矩阵/状态卡全不渲染，报 Identifier has already been declared）。
   要读就动态取：window.Pricing ? Pricing.FREE_AI_DESC : 回退字面量。 */
function freeAiDesc(){
  /* W-FREE-4（10-25）：回退字面量同步新口径 —— 写作批改已改「每月 3 次」，只剩串题素材是会员专属。 */
  return (window.Pricing && window.Pricing.FREE_AI_DESC) || '口语模考每月 1 次 · 写作批改每月 3 次 · 其他 AI 每周 5 次（串题素材为会员专属）';
}


const VIP_ICON_GOLD = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>';

ready(() => {
  renderVipPlans();
  renderVipMatrix();   // 10/12 批1：对比表由 pricing.js 渲染（原静态表搬入）
  renderVipSemi();     // VIP-SEMI-1（10-25）：开通区「一屏两步」半自助（原 renderVipHowPrice 退役）
  loadVipStatus();
});

/* ---------- 对比矩阵（原 vip.html 静态表 9 行口径，逐行等价搬入 pricing.js）---------- */
function renderVipMatrix(){
  const box = document.getElementById('vipMatrix');
  if(!box || !window.Pricing) return;
  Pricing.renderMatrix(box, { legacy:true });
  /* KIMI-P5-5（10-26）：稿子把对比表叫 .kv-compare，共享层 js/pricing.js 渲染的是裸 <table>。
     这里只补一个类名让稿子的样式能挂上，不改任何样式/逻辑（表体仍由 pricing.js 渲染）。 */
  const __kvT = box.querySelector('table');
  if(__kvT && !__kvT.classList.contains('kv-compare')) __kvT.classList.add('kv-compare');
}

/* ---------- 开通方式：一屏两步半自助（VIP-SEMI-1 · 10-25）----------
   她拍板形态：选档位 → 抄一句去转账 → 点「我已转账」。金额即订单（三档价格天然互斥），
   不生成订单号。约束（施工书红线）：
   🔴 价格一律取 Pricing.VIP_PLANS，本函数零价格字面量（_probe_price_ref 钉住的口径）；
   🔴 提交复用 /api/feedback —— 与 feedback.js 弹层完全同一套请求体/限频/登录态语义，零新接口；
   🔴 不写会员状态：开通仍由站长在站长台 vip_grant（反馈行有「去开会员」预填）。
   收款账号是唯一一处常量；她换收款方式只改这一行。 */


function renderVipSemi(){
  const root = document.getElementById('vipSemi');
  if(!root) return;                       // 页面结构没就绪（理论不发生，防御兜底）

  let cur = 'month';                      // 默认 30 天卡（施工书 §二：主推档）
  const loggedIn = !!(DATA.settings && DATA.settings.syncCode && typeof authToken === 'function' && authToken());
  const acct = (DATA.settings && DATA.settings.syncCode) || '';

  /* ---- 档位卡：HTML 只留骨架，价格/名称/日均价全部来自 VIP_PLANS ---- */
  const plansBox = document.getElementById('semiPlans');
  if(plansBox && window.Pricing){
    plansBox.innerHTML = Pricing.VIP_PLANS.map(p =>
      '<button class="semi-plan kv-plan' + (p.id === cur ? ' on' : '') + '" data-semi="' + p.id + '" type="button">'
      + '<span class="nm kv-nm">' + escapeHtml(p.name) + (p.id === 'week' ? '<span class="tag kv-tag">新人</span>' : '') + '</span>'
      + '<span class="pr kv-pr"><b>¥' + escapeHtml(p.price) + '</b>'
      + (p.orig ? '<s>¥' + escapeHtml(p.orig) + '</s>' : '') + '</span>'
      + '<span class="pd kv-pd">' + escapeHtml(p.perDay) + '</span>'
      + '</button>'
    ).join('');
    plansBox.querySelectorAll('button[data-semi]').forEach(b =>
      b.addEventListener('click', () => {
        cur = b.getAttribute('data-semi');
        plansBox.querySelectorAll('button[data-semi]').forEach(x => x.classList.toggle('on', x === b));
        renderSlip();
      }));
  }

  /* ---- 转账句：金额跟着档位走；未登录提示先登录（转账前必须知道给谁开）----
     10-25 深夜：她给了微信+支付宝收款码（img/pay/），转账句保留兜底（有人 prefers 文字转账）。 ---- */
  function slipText(){
    const p = (window.Pricing && Pricing.VIP_PLANS.find(x => x.id === cur)) || null;
    const amount = p ? ('¥' + p.price) : '';
    return '扫上方收款码转 ' + amount + '，转完回来点下面「我已转账」。';
  }
  function renderSlip(){
    const el = document.getElementById('semiTxt');
    const p = (window.Pricing && Pricing.VIP_PLANS.find(x => x.id === cur)) || null;
    if(el) el.innerHTML = '扫上方收款码转 <b>' + (p ? escapeHtml('¥' + p.price) : '') + '</b>，转完回来点下面「我已转账」。';
  }
  renderSlip();

  /* ---- 登录态分叉：按钮组与文案 ---- */
  const actsLogged = document.getElementById('semiActsLogged');
  const actsGuest  = document.getElementById('semiActsGuest');
  const lb = document.getElementById('semiLb');
  if(loggedIn){
    if(actsLogged) actsLogged.hidden = false;
    if(actsGuest)  actsGuest.hidden = true;
    if(lb) lb.textContent = '抄这句去转账';
  }else{
    if(actsLogged) actsLogged.hidden = true;
    if(actsGuest)  actsGuest.hidden = false;
    if(lb) lb.textContent = '先登录，再转账';
  }

  /* ---- 复制这句：剪贴板 + 2 秒回显（拿不到剪贴板就退回手动选择）---- */
  const copyBtn = document.getElementById('semiCopy');
  if(copyBtn){
    copyBtn.addEventListener('click', () => {
      const txt = slipText();
      const done = () => { copyBtn.textContent = '已复制'; setTimeout(() => { copyBtn.textContent = '复制这句'; }, 2000); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
      }else fallbackCopy(txt, done);
    });
  }
  function fallbackCopy(txt, done){
    try{
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta); done();
    }catch(e){ window.prompt('复制这句去转账：', txt); }
  }

  /* ---- 遇到问题：打开站内现成的意见反馈弹层（feedback.js 暴露 openFeedbackSheet）---- */
  ['semiHelp', 'semiHelp2'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.addEventListener('click', () => {
      if(typeof window.openFeedbackSheet === 'function') window.openFeedbackSheet();
    });
  });

  /* ---- 我已转账：提交一条反馈（复用 /api/feedback），成功后整卡切完成态 ---- */
  const doneBtn = document.getElementById('semiDone');
  if(doneBtn){
    doneBtn.addEventListener('click', async () => {
      const plan = (window.Pricing && Pricing.VIP_PLANS.find(x => x.id === cur)) || null;
      const amount = plan ? ('¥' + plan.price) : '';
      const planName = plan ? plan.name : '';
      const text = '会员订单 ' + amount + '（' + planName + '）\n账号：' + (acct || '未登录') + '\n来源：vip.html 半自助';
      const headers = { 'Content-Type': 'application/json' };
      const tok = (typeof authToken === 'function' && authToken()) || '';
      if(tok) headers['X-Session'] = tok;   // 带上登录态 → 站长台反馈行直接显示 acct，不用用户再报账号
      doneBtn.disabled = true; doneBtn.textContent = '提交中…';
      try{
        const res = await fetch('/api/feedback', {
          method: 'POST', headers,
          body: JSON.stringify({
            text: text,
            imgs: [],                                   // 不带图：1 次 KV 写，轻
            contact: acct || '',
            page: 'vip.html',
            env: {
              w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1,
              ua: navigator.userAgent, dark: document.documentElement.getAttribute('data-theme') === 'dark',
              tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
            },
          }),
        });
        const j = await res.json().catch(() => null);
        if(!res.ok || !j || !j.ok){
          doneBtn.disabled = false; doneBtn.textContent = '我已转账';
          alert((j && j.msg) || ('提交失败（HTTP ' + res.status + '），请稍后再试；急事可点「遇到问题」直接找我'));
          return;
        }
        /* 完成态：订单摘要（金额 · 档位 · 账号）——金额/档位仍取自 VIP_PLANS，零字面量 */
        const oid = document.getElementById('semiOid');
        if(oid) oid.textContent = amount + ' · ' + planName + ' · 账号 ' + (acct || '未登录');
        root.hidden = true;
        const doneCard = document.getElementById('semiDoneCard');
        if(doneCard) doneCard.hidden = false;
        const back = document.getElementById('semiBack');
        if(back) back.addEventListener('click', () => {
          doneCard.hidden = true; root.hidden = false;
          doneBtn.disabled = false; doneBtn.textContent = '我已转账';
        });
      }catch(e){
        doneBtn.disabled = false; doneBtn.textContent = '我已转账';
        alert('网络异常，提交没成功。稍后再试一次；急事可点「遇到问题」直接找我。');
      }
    });
  }
}

/* ---------- 价格卡 ---------- */
function renderVipPlans(){
  const box = document.getElementById('vipPlans');
  if(!box) return;
  // 10/2 她拍板：推荐文案按剩余天数动态选卡（≤7天→7天卡 / 8-30→30天卡 / >30→90天卡），不再固定在 30 天卡上
  const exam = (typeof nextExamDate === 'function') ? nextExamDate() : null;
  let daysLeft = 0;
  if(exam && !exam.passed && exam.raw){
    const ed = new Date(exam.raw + 'T00:00:00');
    const t0 = new Date(); t0.setHours(0,0,0,0);
    const v = Math.round((ed - t0) / 86400000);
    if(!isNaN(v) && v > 0) daysLeft = v;
  }
  const recId = daysLeft > 0 ? (daysLeft <= 7 ? 'week' : (daysLeft <= 30 ? 'month' : 'quarter')) : '';
  // 卡片 DOM/文案由 pricing.js 统一产出（class 化样式在 common.css）；主推 30 天卡是 10/2 B 方案拍板位
  if(window.Pricing) Pricing.renderPlanCards(box, { featured:'month', recId:recId, recDays:daysLeft });
}

/* KIMI-P5-5（10-26）· loadVipStatus 新版：只在外层按稿子包 .kv-kicker + .kv-status，
   三态内容、口径、交互一行没改。写成本文件再拼装，避免脚本里嵌模板字符串的转义坑。 */

/* ---------- 状态卡：未登录 / 会员生效中 / 免费版 ----------
   KIMI-P5-5（10-26）：外层按稿子包 .kv-kicker + .kv-status（左侧 3px 品牌边 + 大标题位），
   三态内容、口径、交互一行没改 —— 只多了一层包裹，让稿子那两条基线能匹配。 */
async function loadVipStatus(){
  const box = document.getElementById('vipHero');
  if(!box) return;
  const KICK = '<span class="kv-kicker">MEMBERSHIP · 当前状态</span>';
  if(!authToken()){
    box.innerHTML = KICK + `
      <div class="kv-status">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          ${VIP_ICON_GOLD}
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:16px">先登录，再开通会员</div>
            <div class="muted" style="font-size:13px;margin-top:4px">会员跟账号走；没有账号的话，用邀请码注册即可。</div>
          </div>
          <a class="btn btn-primary" href="login.html" style="text-decoration:none">去登录 / 注册</a>
        </div>
      </div>`;
    return;
  }
  box.innerHTML = KICK + '<div class="kv-status"><div class="muted" style="font-size:13px">正在查询会员状态…</div></div>';
  let vip = null, acct = '';
  try{
    const j = await authApiPost({ action:'vip_status', token: authToken() });
    vip = j.vip || null;
    acct = j.acct || '';
  }catch(e){
    if(e && e.code === 'unauthorized'){
      box.innerHTML = KICK + `
        <div class="kv-status">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            ${VIP_ICON_GOLD}
            <div style="flex:1;min-width:200px">
              <div style="font-weight:700;font-size:16px">登录已过期</div>
              <div class="muted" style="font-size:13px;margin-top:4px">请到「设置 → 云端同步」重新登录后查看会员状态。</div>
            </div>
            <a class="btn" href="settings.html" style="text-decoration:none">去设置</a>
          </div>
        </div>`;
      return;
    }
    box.innerHTML = KICK + '<div class="kv-status"><div class="muted" style="font-size:13px">会员状态查询失败，请稍后刷新重试。</div></div>';
    return;
  }
  if(vip && vip.expire){
    /* expire 兼容两种形态：毫秒数（login/vip_status 下发）与 YYYY-MM-DD 字符串（历史兜底）。
       ⭐ 永久会员（她 10/1：站长本人）expire=9999999999999 → 显示「永久有效」不显示到期日。
       （顺手修既有 bug：原来把毫秒数当字符串日期解析，正常会员到期日一直显示 Invalid Date。） */
    const PERM = typeof vip.expire === 'number' && vip.expire >= 4102444800000;   // ≥ 2100-01-01 视为永久
    let datePart;
    if(PERM){
      datePart = '永久有效';
    } else {
      const d = (typeof vip.expire === 'number') ? new Date(vip.expire) : new Date(String(vip.expire) + 'T00:00:00');
      const left = Math.max(1, Math.ceil((d.getTime() - Date.now()) / 86400000));
      datePart = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 到期（还剩 ' + left + ' 天）';
    }
    box.innerHTML = KICK + `
      <div class="kv-status">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          ${VIP_ICON_GOLD}
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:16px">会员生效中 · ${escapeHtml(acct)}</div>
            <div class="muted" style="font-size:13px;margin-top:4px">${datePart} · AI 功能无限使用</div>
          </div>
          <span class="badge" style="background:var(--primary);color:var(--on-primary)">VIP</span>
        </div>
      </div>`;
  } else {
    box.innerHTML = KICK + `
      <div class="kv-status">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          ${VIP_ICON_GOLD}
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:16px">当前是免费版${acct ? ' · ' + escapeHtml(acct) : ''}</div>
            <div class="muted" style="font-size:13px;margin-top:4px">全部学习功能可用；AI 免费体验：${escapeHtml(freeAiDesc())}；升级会员 AI 无限用。</div>
          </div>
          <button class="btn btn-primary" id="vipGoPlans">升级会员</button>
        </div>
      </div>`;
    const g = document.getElementById('vipGoPlans');
    if(g) g.addEventListener('click', () => {
      const t = document.getElementById('vipPlans');
      if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }
}
