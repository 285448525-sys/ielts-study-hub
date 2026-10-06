/* 意见反馈（她 10/2 拍板）——全站共用一个弹层，入口：侧栏/抽屉「意见反馈」大 Tab。
 *
 * 设计取舍（施工时确认过的）：
 *  · 本文件跟 data.js / common.js 一样**全站引入**，而不是「从设置页跳过来」。
 *    原因：项目有软导航（站内换页不重新加载文档），若只在 settings.html 引本文件，
 *    软导航进别的页后 openFeedbackSheet 就不存在了；而跨页跳转会丢掉「当前页面路径」——
 *    而那恰恰是定位问题最关键的一条。入口直达同一个弹层，行为完全一致。
 *  · 提交是**只写服务端**的单向动作（POST /api/feedback），失败**保留用户已输入的内容**。
 *  · 图片前端压到≤120KB/张、最多 3 张；不上传任何学习数据，只带页面路径 + 屏幕 + UA + 是否登录。
 *
 * 10/2 追加（她拍板）：设置页的意见反馈卡与底部「加微信」条整块删除（已有独立大 Tab），
 * 站长微信**全站唯一出口** = 本弹层底部「等不及回复？加站长微信」超链接 →
 * 点击在弹层内**原位展开**联系方式（不新开弹窗 / 不跳页 / 不丢已写内容）。
 *
 * 与 App Shell 锁壳（≤860px 禁整页竖滚）共存：弹层是 body 直属的 fixed 层，自带内部滚动，
 * 不参与 main.container 的滚动体系，所以锁壳照样生效、弹层照样能滚。
 */
(function(){
  if (window.__fbReady) return;
  window.__fbReady = true;

  const MAX_TEXT = 1000;
  const MAX_IMGS = 3;
  const TARGET_KB = 120;          /* 单张压到这个以内（后端硬限 150KB，留余量） */
  const FB_WX = 'g285448525';     /* ⚠️ 微信号全站唯一出口——别再往别处平铺 */

  let overlay = null;
  let submitting = false;
  let wxOpen = false;            /* 联系方式块是否已展开（每次 open 收成收起态） */

  const $ = s => document.querySelector(s);

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* ---------- 图片压缩：长边 ≤1280，JPEG 质量/尺寸双阶梯逼近 120KB ----------
   * 阶梯是「先降质、再缩尺寸」交替降级。噪声截图（错位像素/纯色差）极难压，
   * 只降质到 0.42 往往还有 130KB+，所以必须一路缩到 0.4 尺寸档才收得住。
   * 全阶梯跑完仍超标 = 这图基本没有可压的信息（如扫描件照片），直接拒收并提示，
   * 绝不把超限的图塞给后端（后端硬限 150KB，超了整条反馈会被 400 拒）。 */
  const LADDER = [
    { s: 1,    q: 0.82 }, { s: 1,    q: 0.72 }, { s: 1,    q: 0.62 },
    { s: 0.78, q: 0.72 }, { s: 0.78, q: 0.6  }, { s: 0.6,  q: 0.62 },
    { s: 0.6,  q: 0.5  }, { s: 0.45, q: 0.55 }, { s: 0.45, q: 0.42 },
    { s: 0.34, q: 0.45 },
  ];
  const kbOf = dataUrl => Math.floor(dataUrl.length * 3 / 4);

  async function compressImage(file){
    if (!/^image\//.test(file.type || '')) throw new Error('只能选图片文件');
    const bmp = await loadBitmap(file);
    const maxSide = 1280;
    let w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > maxSide){
      const k = maxSide / Math.max(w, h);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';                 /* PNG 透明区转 JPEG 会变黑，先铺白底 */
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    for (const step of LADDER){
      const tw = Math.max(1, Math.round(w * step.s));
      const th = Math.max(1, Math.round(h * step.s));
      let out = cv;
      if (step.s !== 1){
        out = document.createElement('canvas');
        out.width = tw; out.height = th;
        const c2 = out.getContext('2d');
        c2.fillStyle = '#fff'; c2.fillRect(0, 0, tw, th);
        c2.drawImage(cv, 0, 0, tw, th);
      }
      const dataUrl = out.toDataURL('image/jpeg', step.q);
      if (kbOf(dataUrl) <= TARGET_KB * 1024) return { mime: 'image/jpeg', b64: dataUrl.split(',')[1] || '' };
    }
    throw new Error('这张图压不到 120KB 以内，换一张或裁一下再传');
  }

  function loadBitmap(file){
    if (window.createImageBitmap){
      return createImageBitmap(file).catch(() => loadViaImg(file));
    }
    return loadViaImg(file);
  }
  function loadViaImg(file){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  /* ---------- 弹层 ---------- */
  function ensureOverlay(){
    if (overlay && document.body.contains(overlay)) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fbOverlay';
    overlay.className = 'fb-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '意见反馈');
    overlay.innerHTML =
      '<div class="fb-backdrop"></div>'
      + '<div class="fb-panel">'
      +   '<div class="fb-head"><b>意见反馈</b><button class="fb-x" type="button" aria-label="关闭">✕</button></div>'
      +   '<div class="fb-body">'
      +     '<label class="fb-lbl" for="fbText">遇到什么问题？<span class="fb-req">必填</span></label>'
      +     '<textarea id="fbText" class="fb-text" rows="4" maxlength="' + MAX_TEXT + '" placeholder="比如：哪个页面、点了哪里、什么现象、当时在做什么"></textarea>'
      +     '<div class="fb-meta"><span id="fbCount">0 / ' + MAX_TEXT + '</span><span id="fbEnv"></span></div>'
      /* 10/6 11:40 她要求：把设置页那行黄底说明删掉，改成在弹层里**轻轻标一行**。
         原话「轻轻标注一下，最多 3 张，这样子」+「想发更多截图的话，可以多发几次反馈这样子」。
         为什么上限是 3 张（她问过）：截图存在 Cloudflare KV，单条记录上限 1MB；
         前端每张压到 ≈120KB，3 张 ≈380KB 留足余量，超了服务端会 413 拒收。 */
      +     '<label class="fb-lbl">截图（最多 ' + MAX_IMGS + ' 张）</label>'
      +     '<div class="fb-picks" id="fbPicks"></div>'
      +     '<input id="fbFile" type="file" accept="image/*" multiple hidden />'
      +     '<button class="fb-add" id="fbAdd" type="button">＋ 添加截图</button>'
      +     '<div class="fb-hint">想多发几张？分多次反馈就行，一次一张也能回得准。</div>'
      +     '<label class="fb-lbl" for="fbContact">联系方式（选填）</label>'
      +     '<input id="fbContact" class="fb-input" maxlength="60" placeholder="微信号 / 邮箱，方便我回你" />'
      +     '<div class="fb-err" id="fbErr"></div>'
      +     '<!-- 10/2 她拍板：急事出口。超链接 → 原位展开微信号（全站唯一出口，不新开弹窗、不丢已写内容） -->'
      +     '<div class="fb-wxwrap">'
      +       '<button class="fb-wxlink" id="fbWxLink" type="button" aria-expanded="false" aria-controls="fbWxBox">等不及回复？加站长微信</button>'
      +       '<div class="fb-wxbox" id="fbWxBox" hidden>'
      +         '<div class="fb-wxbox-lb">站长微信</div>'
      +         '<div class="fb-wxbox-id" id="fbWxId" role="button" tabindex="0" title="点一下复制">' + esc(FB_WX) + '</div>'
      +         '<div class="fb-wxbox-tip">备注来意（开通 / 支付 / bug / 严重问题）我都会通过。反馈表单我一般 1–2 天内看，微信当天回。</div>'
      +         '<button class="fb-wxcopy" id="fbWxCopy" type="button">复制微信号</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="fb-foot">'
      +     '<span class="fb-tip">未登录也能提交；图片只用于定位问题</span>'
      +     '<button class="btn btn-sm" id="fbSubmit" type="button">提交反馈</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(overlay);
    bind(overlay);
    return overlay;
  }

  function bind(el){
    el.querySelector('.fb-x').addEventListener('click', close);
    el.querySelector('.fb-backdrop').addEventListener('click', close);
    const ta = el.querySelector('#fbText');
    const cnt = el.querySelector('#fbCount');
    ta.addEventListener('input', () => { cnt.textContent = (ta.value || '').length + ' / ' + MAX_TEXT; });
    el.querySelector('#fbAdd').addEventListener('click', () => el.querySelector('#fbFile').click());
    el.querySelector('#fbFile').addEventListener('change', ev => { onPick(ev.target.files); ev.target.value = ''; });
    el.querySelector('#fbSubmit').addEventListener('click', submit);
    /* 急事出口：原位展开/收起。展开后滚到可见（弹层自带内滚，App Shell 锁壳不影响） */
    el.querySelector('#fbWxLink').addEventListener('click', () => toggleWx(!wxOpen));
    el.querySelector('#fbWxCopy').addEventListener('click', copyWx);
    el.querySelector('#fbWxId').addEventListener('click', copyWx);
    el.querySelector('#fbWxId').addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); copyWx(); }
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && el.classList.contains('on')) close();
    });
  }

  function toggleWx(next){
    const el = ensureOverlay();
    wxOpen = !!next;
    const box = el.querySelector('#fbWxBox');
    const link = el.querySelector('#fbWxLink');
    box.hidden = !wxOpen;
    link.setAttribute('aria-expanded', wxOpen ? 'true' : 'false');
    link.classList.toggle('on', wxOpen);
    link.textContent = wxOpen ? '收起联系方式' : '等不及回复？加站长微信';
    if (wxOpen) setTimeout(() => { try { box.scrollIntoView({ block:'nearest' }); } catch(_){ box.scrollIntoView(); } }, 30);
  }

  function copyWx(){
    const done = () => { if (window.toast) window.toast('微信号已复制：' + FB_WX); };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(FB_WX).then(done).catch(() => fallbackCopy(done));
    } else fallbackCopy(done);
  }
  function fallbackCopy(done){
    /* 非 https / 老浏览器没有 clipboard API，退回 execCommand；再不行就 toast 原文让用户手打 */
    try{
      const ta = document.createElement('textarea');
      ta.value = FB_WX;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const okk = document.execCommand('copy');
      document.body.removeChild(ta);
      if (okk) done();
      else if (window.toast) window.toast('微信号：' + FB_WX);
    }catch(_){
      if (window.toast) window.toast('微信号：' + FB_WX);
    }
  }

  function open(){
    const el = ensureOverlay();
    /* 环境信息：只带页面路径/屏幕/UA/登录态，不带任何学习数据 */
    const logged = !!(window.authToken && window.authToken());
    el.querySelector('#fbEnv').textContent =
      '页面 ' + (location.pathname.split('/').pop() || 'index.html')
      + ' · ' + (window.innerWidth || 0) + '×' + (window.innerHeight || 0)
      + ' · ' + (logged ? '已登录' : '未登录');
    /* 每次打开都收成收起态：联系方式属于「临时看一眼」，不该跨次留着 */
    if (wxOpen) toggleWx(false);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { const t = el.querySelector('#fbText'); if (t) t.focus(); }, 60);
  }

  function close(){
    if (!overlay) return;
    overlay.classList.remove('on');
    setTimeout(() => { if (overlay) overlay.hidden = true; }, 200);
  }

  const picks = [];   /* {mime,b64,bytes} —— 关弹层不清（重开还在，失败不丢图） */

  async function onPick(fileList){
    const el = ensureOverlay();
    const err = el.querySelector('#fbErr');
    /* ⚠️ 必须先快照成数组：file input 的 FileList 是**活引用**，bind() 里紧接着的
     * `ev.target.value=''` 会把它清空成 0 项，后面再读 files.length 就永远拿不到真实张数。 */
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_IMGS - picks.length;
    if (room <= 0){ err.textContent = '最多 ' + MAX_IMGS + ' 张截图'; return; }
    err.textContent = '正在压缩…';
    let added = 0, bad = '';
    for (const f of files.slice(0, room)){
      try {
        const r = await compressImage(f);
        picks.push({ mime: r.mime, b64: r.b64, bytes: Math.floor(r.b64.length * 3 / 4) });
        added++;
      } catch (e){
        bad = (e && e.message) || '有一张图读不出来，换一张试试';
      }
    }
    if (files.length > room) err.textContent = '只能加 ' + room + ' 张，已忽略多余的';
    else if (bad) err.textContent = bad;
    else err.textContent = '';
    renderPicks();
  }

  function renderPicks(){
    const el = ensureOverlay();
    const box = el.querySelector('#fbPicks');
    box.innerHTML = '';
    picks.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'fb-pick';
      d.innerHTML = '<img alt="截图 ' + (i + 1) + '" src="data:' + p.mime + ';base64,' + p.b64 + '" />'
        + '<span class="fb-pick-kb">' + Math.max(1, Math.round(p.bytes / 1024)) + ' KB</span>'
        + '<button class="fb-pick-x" type="button" aria-label="删除这张">✕</button>';
      d.querySelector('.fb-pick-x').addEventListener('click', () => { picks.splice(i, 1); renderPicks(); });
      box.appendChild(d);
    });
    el.querySelector('#fbAdd').textContent = picks.length ? ('＋ 再加截图（' + picks.length + '/' + MAX_IMGS + '）') : '＋ 添加截图';
  }

  async function submit(){
    if (submitting) return;
    const el = ensureOverlay();
    const err = el.querySelector('#fbErr');
    const ta = el.querySelector('#fbText');
    const contact = el.querySelector('#fbContact');
    const btn = el.querySelector('#fbSubmit');
    const text = (ta.value || '').trim();
    if (!text){ err.textContent = '请先写一下遇到的问题'; ta.focus(); return; }
    if (text.length > MAX_TEXT){ err.textContent = '文字太长了'; return; }

    submitting = true;
    btn.disabled = true; btn.textContent = '提交中…';
    err.textContent = '';
    const headers = { 'Content-Type': 'application/json' };
    const tok = (window.authToken && window.authToken()) || '';
    if (tok) headers['X-Session'] = tok;
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers,
        body: JSON.stringify({
          text: text,
          imgs: picks.map(p => ({ mime: p.mime, b64: p.b64 })),
          contact: (contact.value || '').trim(),
          page: location.pathname.split('/').pop() || 'index.html',
          env: {
            w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1,
            ua: navigator.userAgent, dark: document.documentElement.getAttribute('data-theme') === 'dark',
            tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
          },
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok){
        err.textContent = (j && j.msg) || ('提交失败（HTTP ' + res.status + '），请稍后再试');
        /* ⚠️ 绝不清空用户输入 —— 她打了一半的字不能因为网络问题丢 */
        return;
      }
      ta.value = ''; contact.value = '';
      el.querySelector('#fbCount').textContent = '0 / ' + MAX_TEXT;
      picks.length = 0; renderPicks();
      close();
      if (window.toast) window.toast('谢谢反馈！我会看的');
    } catch (e){
      err.textContent = '网络异常，提交没成功。你的文字还在——急事可点下面的「等不及回复？加站长微信」直接找我';
    } finally {
      submitting = false;
      btn.disabled = false; btn.textContent = '提交反馈';
    }
  }

  window.openFeedbackSheet = open;
  window.closeFeedbackSheet = close;

  /* 侧栏/抽屉里的入口按钮（common.js 注入时就带 data-fb-open，走这里代理） */
  document.addEventListener('click', function(e){
    const t = e.target && e.target.closest ? e.target.closest('[data-fb-open]') : null;
    if (!t) return;
    e.preventDefault();
    open();
  });

  /* 设置页那张「写反馈」按钮：HTML 上直接带 data-fb-open，走上面同一个委托（不单独绑一份逻辑） */
  document.addEventListener('DOMContentLoaded', function(){
    /* 直接改地址栏带 ?fb=1 也能打开（万一是她自己拼的链接 / 以后做「联系客服」深链） */
    if (/(?:^|[?&])fb=1(?:&|$)/.test(location.search || '')) setTimeout(open, 400);
  });
})();
