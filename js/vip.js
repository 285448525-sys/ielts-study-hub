/* === 会员中心（10/1 付费方案第一批） ===
   页面骨架在 vip.html（对比表/流程/FAQ 静态写死），本文件只管两件事：
   ① 按 VIP_PLANS 常量渲染价格卡（改价只动这一处）
   ② 实时查 /api/auth vip_status 渲染顶部状态卡（会员跟账号走，不缓存本地——过期状态必须准） */

/* ⭐ 定价唯一来源（她想调价就改这个数组；perDay 手算填，改价格记得同步改）
   免费 AI 额度 10 次/天 写死在 functions/api/ai.js 的 AI_USER_DAILY_LIMIT 默认值，
   两处口径必须一致：改免费额度 → ai.js 默认值 + 本文件 FREE_AI_DAILY + vip.html 对比表文案。 */
const VIP_PLANS = [
  { id:'month',   name:'月卡', price:'19.9', unit:'月', perDay:'≈ 0.66 元/天', tag:'' },
  { id:'quarter', name:'季卡', price:'49.9', unit:'季', perDay:'≈ 0.55 元/天', tag:'多数人选' },
  { id:'year',    name:'年卡', price:'129',  unit:'年', perDay:'≈ 0.35 元/天', tag:'最划算' },
];
const FREE_AI_DAILY = 10;

const VIP_ICON_GOLD = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>';

ready(() => {
  renderVipPlans();
  loadVipStatus();
});

/* ---------- 价格卡 ---------- */
function renderVipPlans(){
  const box = document.getElementById('vipPlans');
  if(!box) return;
  box.innerHTML = VIP_PLANS.map((p, i) => {
    const featured = p.id === 'year';   // 转化设计：年卡默认最显眼（她不满意可以换 featured 的 id）
    return `
    <div style="flex:1;min-width:180px;border:${featured ? '2px solid var(--primary)' : '1px solid var(--line)'};border-radius:var(--radius);padding:18px 16px;position:relative;background:${featured ? 'var(--primary-soft)' : 'var(--surface)'}">
      ${p.tag ? `<span class="badge" style="position:absolute;top:-10px;right:12px;background:${featured ? 'var(--primary)' : 'var(--surface-2)'};color:${featured ? 'var(--on-primary)' : 'inherit'}">${escapeHtml(p.tag)}</span>` : ''}
      <div style="font-weight:700;font-size:15px">${escapeHtml(p.name)}</div>
      <div style="margin:8px 0 2px"><span style="font-size:28px;font-weight:800">¥${escapeHtml(p.price)}</span><span class="muted" style="font-size:13px"> / ${escapeHtml(p.unit)}</span></div>
      <div class="muted" style="font-size:12px">${escapeHtml(p.perDay)}</div>
      <ul class="muted" style="font-size:12px;margin:10px 0 14px;padding-left:18px;line-height:1.9">
        <li>AI 功能无限次</li>
        <li>会员专属功能（上线即用）</li>
        <li>跟账号走，多设备通用</li>
      </ul>
      <button class="btn ${featured ? 'btn-primary' : ''}" data-vbuy="${p.id}" style="width:100%">立即开通</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-vbuy]').forEach(b =>
    b.addEventListener('click', () => {
      const how = document.getElementById('vipHowto');
      if(how) how.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
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
    const d = new Date(vip.expire + 'T00:00:00');
    const left = Math.max(1, Math.ceil((vip.expire - Date.now()) / 86400000));
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${VIP_ICON_GOLD}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">会员生效中 · ${escapeHtml(acct)}</div>
          <div class="muted" style="font-size:13px;margin-top:4px">${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} 到期（还剩 ${left} 天）· AI 功能无限使用</div>
        </div>
        <span class="badge" style="background:var(--primary);color:var(--on-primary)">VIP</span>
      </div>`;
  } else {
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${VIP_ICON_GOLD}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:16px">当前是免费版${acct ? ' · ' + escapeHtml(acct) : ''}</div>
          <div class="muted" style="font-size:13px;margin-top:4px">全部学习功能可用，AI 功能每天 ${FREE_AI_DAILY} 次额度；升级会员 AI 无限用。</div>
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
