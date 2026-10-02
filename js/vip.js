/* === 会员中心（10/1 付费方案第一批） ===
   页面骨架在 vip.html（对比表/流程/FAQ 静态写死），本文件只管两件事：
   ① 按 VIP_PLANS 常量渲染价格卡（改价只动这一处）
   ② 实时查 /api/auth vip_status 渲染顶部状态卡（会员跟账号走，不缓存本地——过期状态必须准） */

/* ⭐ 定价唯一来源（她想调价就改这个数组；perDay/save 手算填，改价格记得同步改）
   10/2 定价 v2（她拍板 B 窗口商业方案）：7 天卡 29（首购入口）/ 30 天卡 69（主推 C 位）/ 90 天卡 129（价格锚）；
   年卡砍掉——考生需求随考试日消失，无年需求（499 只会把页面衬贵）。
   90 天卡给两轮备考/单科重考（60 天窗口）人群摆着衬托 69 划算。
   配套动作：① 免费额度用完提示只推 ¥29 周卡（functions/api/ai.js 文案同步改）
             ② 主推卡贴考试日：「距你的考试还有 N 天，30 天卡刚好覆盖」（读 settings.examDate，无则不显示）。
   免费额度 10/1 下午起为她拍板新口径（口语模考每月 1 次 / 写作批改会员专属 / 其余 AI 每周 5 次），
   写死在 functions/api/ai.js（AI_FREE_MOCK_MONTHLY / AI_FREE_WRITING_TOTAL=0 / AI_USER_WEEKLY_LIMIT=5），
   口径必须一致的处所：ai.js 默认值 + auth.js ai_usage + vip.html 对比表（改额度三处同步）。 */
const VIP_PLANS = [
  { id:'week',    name:'7 天卡',  price:'29',  unit:'7 天',  perDay:'≈ 4.1 元/天', save:'', tag:'' },
  { id:'month',   name:'30 天卡', price:'69',  unit:'30 天', perDay:'≈ 2.3 元/天', save:'', tag:'主推 · 冲刺首选' },
  { id:'quarter', name:'90 天卡', price:'129', unit:'90 天', perDay:'≈ 1.4 元/天', save:'', tag:'' },
];
const FREE_AI_DESC = '口语模考每月 1 次 · 其他 AI 每周 5 次（写作批改/串题素材为会员专属）';

const VIP_ICON_GOLD = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>';

ready(() => {
  renderVipPlans();
  loadVipStatus();
});

/* ---------- 价格卡 ---------- */
function renderVipPlans(){
  const box = document.getElementById('vipPlans');
  if(!box) return;
  // 10/2 配套动作②：主推卡贴考试日（她拍板 B 方案）——读下一次考试日期算天数，没设就不显示
  // （nextExamDate 返回 {raw,passed}，不带 Date 对象，天数自己从 raw 算）
  const exam = (typeof nextExamDate === 'function') ? nextExamDate() : null;
  let daysLeft = 0;
  if(exam && !exam.passed && exam.raw){
    const ed = new Date(exam.raw + 'T00:00:00');
    const t0 = new Date(); t0.setHours(0,0,0,0);
    const v = Math.round((ed - t0) / 86400000);
    if(!isNaN(v) && v > 0) daysLeft = v;
  }
  box.innerHTML = VIP_PLANS.map((p, i) => {
    const featured = p.id === 'month';   // 转化设计：30 天卡主推 C 位（B 方案拍板；换主推改这个 id）
    return `
    <div style="flex:1;min-width:180px;border:${featured ? '2px solid var(--primary)' : '1px solid var(--line)'};border-radius:var(--radius);padding:18px 16px;position:relative;background:${featured ? 'var(--primary-soft)' : 'var(--surface)'}">
      ${p.tag ? `<span class="badge" style="position:absolute;top:-10px;right:12px;background:${featured ? 'var(--primary)' : 'var(--surface-2)'};color:${featured ? 'var(--on-primary)' : 'inherit'}">${escapeHtml(p.tag)}</span>` : ''}
      <div style="font-weight:700;font-size:15px">${escapeHtml(p.name)}</div>
      <div style="margin:8px 0 2px"><span style="font-size:28px;font-weight:800">¥${escapeHtml(p.price)}</span><span class="muted" style="font-size:13px"> / ${escapeHtml(p.unit)}</span></div>
      <div class="muted" style="font-size:12px">${escapeHtml(p.perDay)}${p.save ? ' · <b style="color:var(--warn-ink)">' + escapeHtml(p.save) + '</b>' : ''}</div>
      <ul class="muted" style="font-size:12px;margin:10px 0 14px;padding-left:18px;line-height:1.9">
        <li>AI 功能无限次</li>
        <li>会员专属功能（上线即用）</li>
        <li>跟账号走，多设备通用</li>
      </ul>
      ${featured && daysLeft > 0 ? `<div style="font-size:12.5px;font-weight:600;color:var(--primary);margin:-4px 0 10px">距你的考试还有 ${daysLeft} 天，30 天卡刚好覆盖 →</div>` : ''}
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
          <div class="muted" style="font-size:13px;margin-top:4px">全部学习功能可用；AI 免费体验：${FREE_AI_DESC}；升级会员 AI 无限用。</div>
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
