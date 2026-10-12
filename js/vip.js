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
  return (window.Pricing && window.Pricing.FREE_AI_DESC) || '口语模考每月 1 次 · 其他 AI 每周 5 次（写作批改/串题素材为会员专属）';
}

const VIP_ICON_GOLD = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>';

ready(() => {
  renderVipPlans();
  renderVipMatrix();   // 10/12 批1：对比表由 pricing.js 渲染（原静态表搬入）
  renderVipHowPrice(); // 10/12 批1：开通方式的价格句由 pricing.js 填充
  loadVipStatus();
});

/* ---------- 对比矩阵（原 vip.html 静态表 9 行口径，逐行等价搬入 pricing.js）---------- */
function renderVipMatrix(){
  const box = document.getElementById('vipMatrix');
  if(!box || !window.Pricing) return;
  Pricing.renderMatrix(box, { legacy:true });
}

/* ---------- 开通方式的价格句（原手写三档价格，改 JS 填充防改价漏改）---------- */
function renderVipHowPrice(){
  const el = document.getElementById('vipHowPrice');
  if(!el || !window.Pricing) return;
  el.innerHTML = Pricing.VIP_PLANS
    .map(p => escapeHtml(Pricing.priceText(p.id === 'week' ? 'weekFirst' : p.id)))
    .join(' / ');
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

/* ---------- 状态卡：未登录 / 会员生效中 / 免费版 ---------- */
async function loadVipStatus(){
  const box = document.getElementById('vipHero');
  if(!box) return;
  if(!authToken()){
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${VIP_ICON_GOLD}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">先登录，再开通会员</div>
          <div class="muted" style="font-size:13px;margin-top:4px">会员跟账号走；没有账号的话，用邀请码注册即可。</div>
        </div>
        <a class="btn btn-primary" href="login.html" style="text-decoration:none">去登录 / 注册</a>
      </div>`;
    return;
  }
  box.innerHTML = '<div class="muted" style="font-size:13px">正在查询会员状态…</div>';
  let vip = null, acct = '';
  try{
    const j = await authApiPost({ action:'vip_status', token: authToken() });
    vip = j.vip || null;
    acct = j.acct || '';
  }catch(e){
    if(e && e.code === 'unauthorized'){
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          ${VIP_ICON_GOLD}
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:16px">登录已过期</div>
            <div class="muted" style="font-size:13px;margin-top:4px">请到「设置 → 云端同步」重新登录后查看会员状态。</div>
          </div>
          <a class="btn" href="settings.html" style="text-decoration:none">去设置</a>
        </div>`;
      return;
    }
    box.innerHTML = '<div class="muted" style="font-size:13px">会员状态查询失败，请稍后刷新重试。</div>';
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
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${VIP_ICON_GOLD}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">会员生效中 · ${escapeHtml(acct)}</div>
          <div class="muted" style="font-size:13px;margin-top:4px">${datePart} · AI 功能无限使用</div>
        </div>
        <span class="badge" style="background:var(--primary);color:var(--on-primary)">VIP</span>
      </div>`;
  } else {
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${VIP_ICON_GOLD}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">当前是免费版${acct ? ' · ' + escapeHtml(acct) : ''}</div>
          <div class="muted" style="font-size:13px;margin-top:4px">全部学习功能可用；AI 免费体验：${escapeHtml(freeAiDesc())}；升级会员 AI 无限用。</div>
        </div>
        <button class="btn btn-primary" id="vipGoPlans">升级会员</button>
      </div>`;
    const g = document.getElementById('vipGoPlans');
    if(g) g.addEventListener('click', () => {
      const t = document.getElementById('vipPlans');
      if(t) t.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }
}
