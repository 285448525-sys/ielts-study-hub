/* pay.html 业务脚本（P2-PAY-NEW · 2026-10-27）
   只做三件事：读 URL ?plan= → 渲染档摘要；登录分叉；「我已转账」本地 UI 切换。

   🔴 三条硬约束（施工书 + B0 产品方案定的，别改）：
   ① 零价格字面量：档名与价格全部读 js/pricing.js 的 VIP_PLANS（与会员页同一份），
      本文件不出现任何 ¥ 数字 —— 改价只动 pricing.js 一处，本页自动跟上。
   ② 「我已转账」**只切本地 UI，零网络请求**（不新建 /api/vip/claim，撞冻结线）。
   ③ 登录分叉：未登录能看档摘要，但主按钮置灰 + 挂「先登录再付款」条；
      登录态下在摘要区下方显示用户邮箱（付款备注要用），拿不到邮箱就显示中性提示、不编。

   ⚠️ 与软导航的关系：本页会被软导航带进来（vip.html 的 .plan-buy 是普通 <a>），
      pay.html 自己引了 data-shell="top" 与整套共享外壳 → 壳能正常初始化。
      ready() 由 common.js 提供，脚本按 defer 顺序在 common-* 之后执行。 */

/* 档位兜底默认 = month（30 天，站内主推档）。真实数据一律来自 VIP_PLANS。 */
var PAY_DEFAULT_PLAN = 'month';

/* 取档数据：优先 VIP_PLANS（唯一真源）；缺失时返回 null，由调用方显示中性占位、绝不编价格 */
function payPlanOf(key){
  try{
    if(typeof VIP_PLANS === 'undefined' || !Array.isArray(VIP_PLANS)) return null;
    var k = key || PAY_DEFAULT_PLAN;
    var hit = null;
    for(var i = 0; i < VIP_PLANS.length; i++){
      if(VIP_PLANS[i] && VIP_PLANS[i].id === k){ hit = VIP_PLANS[i]; break; }
    }
    if(!hit){
      for(var j = 0; j < VIP_PLANS.length; j++){
        if(VIP_PLANS[j] && VIP_PLANS[j].id === PAY_DEFAULT_PLAN){ hit = VIP_PLANS[j]; break; }
      }
    }
    return hit;
  }catch(e){ return null; }
}

/* 读 URL 参数里的 plan（非法值一律回落到默认档，不报错、不白屏） */
function payPlanKey(){
  try{
    var v = new URL(location.href).searchParams.get('plan');
    if(v && payPlanOf(v)) return v;
  }catch(e){}
  return PAY_DEFAULT_PLAN;
}

/* 渲染档摘要 */
function payRenderSummary(){
  var key = payPlanKey();
  var p = payPlanOf(key);
  var nameEl = document.getElementById('pName');
  var priceEl = document.getElementById('pPrice');
  if(!p){
    /* 数据没到位（pricing.js 没加载 / 被裁）→ 中性占位，不编价格 */
    if(nameEl) nameEl.textContent = '会员';
    if(priceEl) priceEl.textContent = '以会员页为准';
    return;
  }
  if(nameEl) nameEl.textContent = p.name || '';
  if(priceEl) priceEl.textContent = (p.price ? ('¥' + p.price) : '以会员页为准');
}

/* 登录态判定：站内唯一口径 = localStorage.hub_auth_token（与 common-cloud 一致） */
function payIsLoggedIn(){
  try{ return !!localStorage.getItem('hub_auth_token'); }catch(e){ return false; }
}

/* 取当前账号邮箱：优先 common-cloud 已在内存里的结果，其次问 /api/auth。
   ⚠️ 拿不到就显示中性提示，**绝不编一个邮箱**（付款备注填错等于站长认不到单）。 */
function payFillEmail(){
  var el = document.getElementById('userEmail');
  if(!el) return;
  var done = function(mail){
    el.textContent = (mail && String(mail).indexOf('@') > 0) ? String(mail) : '（点右上角头像可查看账号邮箱）';
  };
  /* 1) 内存里已有（common-cloud 登录后会缓存） */
  try{
    if(typeof DATA !== 'undefined' && DATA && DATA.settings && DATA.settings.syncCode && String(DATA.settings.syncCode).indexOf('@') > 0){
      done(DATA.settings.syncCode); return;
    }
  }catch(e){}
  /* 2) 问一次 /api/auth（只读查询，不发任何付款/开通请求） */
  try{
    var tok = localStorage.getItem('hub_auth_token');
    if(!tok || typeof fetch !== 'function'){ done(''); return; }
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'me', token: tok }),
      cache: 'no-store'
    }).then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ done(j && (j.email || j.acct) ? (j.email || j.acct) : ''); })
      .catch(function(){ done(''); });
  }catch(e){ done(''); }
}

/* 登录分叉：未登录 = 挂提示条 + 主按钮置灰；已登录 = 显示邮箱条 */
function payRenderLoginBranch(){
  var logged = payIsLoggedIn();
  var hint = document.getElementById('loginHint');
  var note = document.getElementById('loggedNote');
  var btn = document.getElementById('doneBtn');
  if(logged){
    if(hint) hint.hidden = true;
    if(note) note.hidden = false;
    if(btn){ btn.disabled = false; btn.removeAttribute('title'); }
    payFillEmail();
  }else{
    if(hint) hint.hidden = false;
    if(note) note.hidden = true;
    if(btn){ btn.disabled = true; btn.setAttribute('title', '请先登录再付款'); }
    /* 登录后要带原参数回来，别让用户重选档位 */
    var go = document.getElementById('loginGo');
    if(go){
      try{
        var key = payPlanKey();
        go.setAttribute('href', 'login.html?back=' + encodeURIComponent('pay.html?plan=' + key));
      }catch(e){}
    }
  }
}

/* 「我已转账」——**只切本地 UI，零网络请求**（硬约束 ②） */
function payBindActs(){
  var doneBtn = document.getElementById('doneBtn');
  var acts = document.getElementById('actsBlock');
  var recv = document.getElementById('receivedBlock');
  var notYet = document.getElementById('notYetBtn');
  if(doneBtn && acts && recv){
    doneBtn.addEventListener('click', function(){
      if(doneBtn.disabled) return;             /* 未登录时按钮已 disabled，这里是双保险 */
      acts.style.display = 'none';
      recv.classList.add('show');
      try{ recv.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){}
    });
  }
  if(notYet && acts && recv){
    notYet.addEventListener('click', function(){
      recv.classList.remove('show');
      acts.style.display = '';
    });
  }
}

/* 入口：ready() 在 common.js 里；软导航重进本页会重跑，所以全部幂等（只读 DOM + 重绑前先判标记） */
ready(function(){
  payRenderSummary();
  payRenderLoginBranch();
  payBindActs();
  /* 软导航进来时 URL 可能带新参数 → 再渲染一次（幂等，纯读） */
  window.addEventListener('popstate', function(){ payRenderSummary(); payRenderLoginBranch(); });
});
