/* =========================================================================
   老师端「学生数据」页（三级权限第二批 · 2026-10-22）
   设计依据：design/115-老师端学生数据_方案_2026-10-21.html（她 10-22 回「按推荐做」）

   数据来源只有 /api/roles 三个请求，串行、各自有状态：
     ① ?action=me        → 判角色（无权限直接渲染「没权限」，**连名单都不请求**）
     ② ?action=students  → 绑定名单（只有邮箱 + 最近活跃；昵称进详情才读）
     ③ ?view=<email>     → 一个人的白名单视图（成绩 / 时长 / 词汇 / 提交原文）
   🔴 鉴权在服务端（fail closed）；本页只负责「没有权限就别显示内容」，不承担安全边界。
   🔴 整页只读：没有任何 input/textarea（名单搜索框除外），原文一律转义后渲染。
   ========================================================================= */
(function () {
  'use strict';

  const API = '/api/roles';
  const S = {
    role: '', acct: '',
    students: [], cur: '',
    view: null,
    filter: 'all',        // all | speaking | writing
    limit: 12,            // 提交列表每次显示条数（点「更多」+12）
    busy: false,
    meDone: false
  };

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function token() {
    try {
      if (typeof authToken === 'function') return authToken();
      return localStorage.getItem('hub_auth_token') || '';
    } catch (e) { return ''; }
  }
  function root() { return document.getElementById('tchRoot'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* 时间戳 → 「今天 14:20 / 昨天 09:05 / 3 天前 / 12 天前」 */
  function relWhen(ts) {
    const t = Number(ts) || 0;
    if (!t) return '';
    const d = new Date(t);
    const now = new Date();
    const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate())
      - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (diff <= 0) return '今天 ' + hm;
    if (diff === 1) return '昨天 ' + hm;
    if (diff < 30) return diff + ' 天前';
    return (d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /* 活跃度点：今天=绿 / 3 天内=橙 / 更早=灰 / 从没同步=空心 */
  function dotCls(ts) {
    const t = Number(ts) || 0;
    if (!t) return 'n';
    const days = (Date.now() - t) / 86400000;
    if (days <= 1) return '';
    if (days <= 3) return 'w';
    return 'g';
  }
  function shortEmail(e) { return String(e || '').split('@')[0] || String(e || ''); }
  function initialOf(s) {
    const t = String(s || '').trim();
    if (!t) return '?';
    return /[a-z]/i.test(t[0]) ? t[0].toUpperCase() : t[0];
  }
  function avCls(s) {
    const c = String(s || '').toLowerCase().charCodeAt(0) || 0;
    return ['', 'b', 'c', 'd'][c % 4];
  }
  /* 分钟 → 大数字卡（带 <u> 单位） */
  function bigMin(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 60) return m + '<u>分钟</u>';
    const h = Math.floor(m / 60), mm = m % 60;
    return h + '<u>小时</u>' + (mm ? mm + '<u>分</u>' : '');
  }
  function txtMin(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), mm = m % 60;
    return h + ' 小时' + (mm ? ' ' + mm + ' 分' : '');
  }
  const TYPE_CN = { reading: '阅读', listening: '听力', writing: '写作', speaking: '口语' };
  function typeCn(t) { return TYPE_CN[String(t || '').toLowerCase()] || ''; }

  /* ---------- 请求 ---------- */
  async function api(qs) {
    const res = await fetch(API + '?' + qs, {
      headers: { 'X-Session': token() },
      cache: 'no-store',
      credentials: 'omit'
    });
    let j = null;
    try { j = await res.json(); } catch (e) { j = null; }
    return { status: res.status, ok: res.ok, j: j };
  }

  /* ---------- 状态稿 ---------- */
  const IC = {
    lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
    people: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-1.6c0-2-1.7-3.6-3.8-3.6H6.8C4.7 14.8 3 16.4 3 18.4V20"/><circle cx="9.5" cy="8" r="3.4"/><path d="M17 11.5h4M19 9.5v4"/></svg>',
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5V13"/><circle cx="12" cy="16.6" r="1"/><circle cx="12" cy="12" r="9"/></svg>',
    err: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.2v.2"/></svg>'
  };

  function stateHtml(o) {
    return '<div class="tch-state">'
      + '<span class="ic ' + (o.tone || '') + '">' + (o.icon || IC.lock) + '</span>'
      + '<b>' + esc(o.title) + '</b>'
      + '<p>' + (o.desc || '') + '</p>'
      + '<div class="acts">' + (o.acts || '') + '</div>'
      + '</div>';
  }
  function skeleton() {
    return '<div class="tch-skel" aria-hidden="true">'
      + '<div class="skel-row"><span class="skel-av"></span><span class="skel-bar w42"></span></div>'
      + '<div class="skel-bar w66"></div><div class="skel-bar h72"></div>'
      + '<div class="skel-bar h72"></div><div class="skel-bar h96"></div></div>';
  }
  function paint(html) { const r = root(); if (r) r.innerHTML = html; }

  function noPerm(kind) {
    /* kind: 'guest' 未登录 / 'user' 普通用户 */
    if (kind === 'guest') {
      paint(stateHtml({
        tone: 'gray', icon: IC.lock,
        title: '先登录才能看这一页',
        desc: '这一页是给管理员（机构教师）看学生数据的，需要用自己的账号登录。',
        acts: '<a class="tch-btn" href="login.html">去登录</a><a class="tch-btn ghost" href="home.html">回首页</a>'
      }));
    } else {
      paint(stateHtml({
        tone: 'gray', icon: IC.lock,
        title: '这一页需要管理员权限',
        desc: '你自己的学习记录在「首页」和「回顾」里，这里放的是管理员绑定的学生数据。',
        acts: '<a class="tch-btn" href="home.html">回首页</a><a class="tch-btn ghost" href="review.html">看我的记录</a>'
      }));
    }
  }
  function emptyRoster() {
    paint(stateHtml({
      icon: IC.people,
      title: '还没有绑定学生',
      desc: '学生名单由系统管理员在站长台「角色管理」里维护。绑定后刷新这一页就能看到。',
      acts: '<button class="tch-btn" type="button" data-act="reload">刷新看看</button>'
    }));
  }

  /* ---------- 名单 ---------- */
  function rosterHtml() {
    let h = '<div class="tch-roster-top">'
      + '<div class="lab">我的学生<b>' + S.students.length + ' 人</b></div>'
      + '<label class="tch-rsearch">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
      + '<input type="search" id="tchSearch" placeholder="搜邮箱前缀" aria-label="搜索学生" autocomplete="off" />'
      + '</label></div>'
      + '<div class="tch-rlist" id="tchRList">';
    for (const st of S.students) {
      const nm = shortEmail(st.email);
      const on = st.email === S.cur ? ' on' : '';
      const when = st.lastActive ? relWhen(st.lastActive) + ' 有更新' : '还没有同步过数据';
      h += '<button class="tch-ritem' + on + '" type="button" data-email="' + esc(st.email) + '">'
        + '<span class="tch-rav ' + avCls(nm) + '">' + esc(initialOf(nm)) + '</span>'
        + '<span class="tch-rmeta"><b>' + esc(nm) + '</b><span>' + esc(when) + '</span></span>'
        + '<i class="tch-rdot ' + dotCls(st.lastActive) + '"></i></button>';
    }
    h += '</div><div class="tch-roster-foot">名单由系统管理员在站长台维护，你这里只读</div>';
    return h;
  }

  function stuOf(email) {
    for (const s of S.students) if (s.email === email) return s;
    return null;
  }

  /* ---------- 详情 ---------- */
  function chartHtml(mocks) {
    const pts = mocks.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); })
      .filter(function (m) { return m.overall != null; })
      .slice(-7)
      .map(function (m) { return { d: m.date, v: Number(m.overall), t: m.type }; });
    if (pts.length < 2) {
      return '<p class="tch-note" style="margin-top:14px">模考记录还太少，画不出趋势。' +
        (pts.length === 1 ? '目前只有 1 次：' + esc(pts[0].d) + ' 总分 ' + pts[0].v.toFixed(1) + '。' : '') + '</p>';
    }
    const vals = pts.map(function (p) { return p.v; });
    let lo = Math.floor(Math.min.apply(null, vals) * 2) / 2;
    let hi = Math.ceil(Math.max.apply(null, vals) * 2) / 2;
    if (hi - lo < 1) hi = lo + 1;
    const X = function (i) { return 30 + i * (480 / (pts.length - 1)); };
    const Y = function (v) { return 160 - ((v - lo) / (hi - lo)) * 120; };
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4;
      const y = Y(v);
      g += '<line class="grid' + (k === 0 ? ' base' : '') + '" x1="30" y1="' + y.toFixed(1) + '" x2="500" y2="' + y.toFixed(1) + '"/>'
        + '<text class="axis" x="0" y="' + (y + 3).toFixed(1) + '">' + v.toFixed(1) + '</text>';
    }
    const line = pts.map(function (p, i) { return X(i).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ');
    let dots = '';
    pts.forEach(function (p, i) {
      dots += '<circle class="pt' + (i === pts.length - 1 ? ' last' : '') + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + (i === pts.length - 1 ? 5 : 3.4) + '"/>';
    });
    let labels = '';
    pts.forEach(function (p, i) {
      const md = String(p.d).slice(5);
      labels += '<text class="axis-l" x="' + X(i).toFixed(1) + '" y="182" text-anchor="middle">' + esc(md) + '</text>';
    });
    return '<div class="tch-chart"><svg viewBox="0 0 520 190" role="img" aria-label="最近 ' + pts.length + ' 次模考总分折线">'
      + g + '<polyline class="ln" points="' + line + '"/>' + dots + labels
      + '</svg></div>';
  }

  const LV_COLORS = ['#d3ebe8', '#a8d7d2', '#7ccac2', '#56b3ab', '#3a9a93', '#2f867f', '#2c7873', '#235e5a'];

  function vocabHtml(v) {
    const total = Math.max(1, Number(v.total) || 0);
    const lv = Array.isArray(v.levels) ? v.levels : [];
    const fresh = (lv.find(function (x) { return x.level === 0; }) || {}).count || 0;
    /* ⚠️ 「已掌握」是 cleared 标记，和档位统计**不是互斥集合**（一个 Lv5 的词也可能被标已掌握）。
       所以「在学」不能直接取 1~6 档之和（那样三块加起来会超过总词数，看上去像算错了）。
       口径：在学 = 总词数 − 已掌握 − 新词，保证三块相加 = 总词数。 */
    const learning = Math.max(0, total - (Number(v.cleared) || 0) - fresh);
    let bar = '';
    lv.forEach(function (x) {
      const pct = (x.count || 0) / total * 100;
      if (pct <= 0) return;
      bar += '<i style="width:' + pct.toFixed(2) + '%;background:' + LV_COLORS[x.level] + '" title="' + esc(x.name) + ' ' + x.count + ' 词"></i>';
    });
    if (!bar) bar = '<i style="width:100%;background:var(--surface-2)"></i>';
    return '<div class="tch-vsum">'
      + '<div><div class="k">已掌握</div><div class="v">' + (v.cleared || 0) + '<u>词</u></div></div>'
      + '<div><div class="k">在学</div><div class="v">' + learning + '<u>词</u></div></div>'
      + '<div><div class="k">新词</div><div class="v">' + fresh + '<u>词</u></div></div>'
      + '</div>'
      + '<div class="tch-vbar">' + bar + '</div>'
      + '<div class="tch-vleg">'
      + '<span><i style="background:#d3ebe8"></i>新词</span>'
      + '<span><i style="background:#7ccac2"></i>1-2 档</span>'
      + '<span><i style="background:#3a9a93"></i>3-4 档</span>'
      + '<span><i style="background:#2f867f"></i>5-6 档</span>'
      + '<span><i style="background:#235e5a"></i>长期记住</span>'
      + '</div>'
      + (v.dueToday > 0
        ? '<div class="tch-vdue"><svg viewBox="0 0 24 24" fill="none" stroke="#b7791f" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>今天有 <b>' + v.dueToday + ' 个</b>词到期待复习</div>'
        : '<p class="tch-note">今天没有到期要复习的词。</p>');
  }

  function barsHtml(time) {
    const list = Array.isArray(time.byModule) ? time.byModule : [];
    if (!list.length) return '<p class="tch-note" style="margin-top:12px">还没有计时记录 —— 学生在「计时」里选模块开计时才会产生学习时长。</p>';
    const max = Math.max.apply(null, list.map(function (x) { return x.minutes || 0; })) || 1;
    let h = '<div class="tch-bars">';
    for (const m of list) {
      h += '<div class="tch-brow"><span class="nm" title="' + esc(m.module) + '">' + esc(m.module) + '</span>'
        + '<span class="track"><i style="width:' + Math.max(2, (m.minutes || 0) / max * 100).toFixed(1) + '%"></i></span>'
        + '<span class="v">' + esc(txtMin(m.minutes)) + '</span></div>';
    }
    return h + '</div>';
  }

  function subsFiltered() {
    const all = Array.isArray(S.view.submissions) ? S.view.submissions : [];
    if (S.filter === 'all') return all;
    return all.filter(function (x) { return x.kind === S.filter; });
  }

  function subsHtml() {
    const all = Array.isArray(S.view.submissions) ? S.view.submissions : [];
    const nSp = all.filter(function (x) { return x.kind === 'speaking'; }).length;
    const nWr = all.filter(function (x) { return x.kind === 'writing'; }).length;
    const list = subsFiltered();
    let h = '<div class="tch-panel"><div class="tch-ph"><b>练习提交</b>'
      + '<div class="segs" role="group" aria-label="按类型筛选">'
      + '<button type="button" data-filter="all" class="' + (S.filter === 'all' ? 'on' : '') + '">全部 ' + all.length + '</button>'
      + '<button type="button" data-filter="speaking" class="' + (S.filter === 'speaking' ? 'on' : '') + '">口语 ' + nSp + '</button>'
      + '<button type="button" data-filter="writing" class="' + (S.filter === 'writing' ? 'on' : '') + '">写作 ' + nWr + '</button>'
      + '</div></div>';
    if (!list.length) {
      h += '<p class="tch-note" style="margin-top:12px">'
        + (all.length ? '这个类型还没有提交。' : '还没有口语或写作的提交 —— 学生在「口语」答题、在「写作」交作文后，原文会出现在这里。')
        + '</p></div>';
      return h;
    }
    const show = list.slice(0, S.limit);
    h += '<div class="tch-sublist" id="tchSubList">';
    show.forEach(function (s, i) {
      const kind = s.kind === 'writing' ? 'wr' : 'sp';
      const kindCn = s.kind === 'writing' ? '写作' : '口语';
      const when = s.ts ? relWhen(s.ts) : '';
      const chars = String(s.text || '').length.toLocaleString('zh-CN');
      h += '<div class="tch-srow" data-i="' + i + '">'
        + '<button class="tch-sbtn" type="button" aria-expanded="false">'
        + '<span class="tch-kind ' + kind + '">' + kindCn + (s.part ? ' ' + esc(s.part) : '') + '</span>'
        + '<span class="t">' + '<b>' + esc(s.title || '（无标题）') + '</b>'
        + '<span>' + esc(when) + ' · ' + chars + ' 字符</span></span>'
        + '<span class="ar" aria-hidden="true">›</span></button></div>';
    });
    h += '</div>';
    if (list.length > show.length) {
      h += '<div class="tch-submore"><button type="button" data-act="more">再看 ' + (list.length - show.length) + ' 条</button></div>';
    }
    h += '</div>';
    return h;
  }

  function detailHtml() {
    const v = S.view;
    const st = stuOf(S.cur) || { email: S.cur, lastActive: 0 };
    const nick = (v.student && v.student.nickname) || '';
    const prefix = shortEmail(st.email);
    const name = nick || prefix;

    /* ① 最近模考：模考记录优先，没有就用手工录入的分项均分 */
    const mocks = (v.scores && Array.isArray(v.scores.mock)) ? v.scores.mock.slice() : [];
    const withScore = mocks.filter(function (m) { return m.overall != null; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    let latest = null, prev = null;
    if (withScore.length) { latest = withScore[0]; prev = withScore[1] || null; }
    let examVal = '—', examSub = '还没有模考记录';
    if (latest) {
      examVal = Number(latest.overall).toFixed(1);
      examSub = String(latest.date).slice(5) + (typeCn(latest.type) ? ' ' + typeCn(latest.type) : '')
        + (prev ? ' · 上次 ' + Number(prev.overall).toFixed(1) : '');
    } else if (v.scores && Array.isArray(v.scores.manual) && v.scores.manual.length) {
      const ms = v.scores.manual.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      const vals = [ms.listening, ms.reading, ms.writing, ms.speaking].filter(function (x) { return x != null && isFinite(x); });
      if (vals.length) {
        const avg = vals.reduce(function (a, b) { return a + Number(b); }, 0) / vals.length;
        examVal = avg.toFixed(1);
        examSub = '手工录入 · ' + String(ms.date).slice(5) + ' · ' + vals.length + ' 项均值';
      }
    }

    const t = v.time || { totalMinutes: 0, weekMinutes: 0, byModule: [] };
    const vb = v.vocab || { total: 0, cleared: 0, dueToday: 0, levels: [] };
    const weekdayAvg = Math.round((t.weekMinutes || 0) / 7);

    return '<div class="tch-pick">'
      + '<span class="av">' + esc(initialOf(name)) + '</span>'
      + '<div class="m"><b>' + esc(name) + '</b><span>' + esc(st.lastActive ? relWhen(st.lastActive) + ' 有更新' : '还没有同步过数据') + '</span></div>'
      + '<button type="button" data-act="sheet">切换</button>'
      + '</div>'
      + '<div class="tch-idband">'
      + '<span class="av">' + esc(initialOf(name)) + '</span>'
      + '<div class="who"><b>' + esc(name) + '</b><span>' + esc(st.email) + (nick ? ' · ' + esc(prefix) : '') + '</span></div>'
      + '<div class="tch-chips">'
      + (st.lastActive ? '<span class="tch-chip live">' + esc(relWhen(st.lastActive)) + ' 有更新</span>' : '<span class="tch-chip">还没有同步过数据</span>')
      + '<span class="tch-chip">只读视图</span>'
      + '</div></div>'
      + '<div class="tch-stats">'
      + '<div class="tch-stat"><div class="lb">本周学习</div><div class="vl">' + bigMin(t.weekMinutes) + '</div>'
      + '<div class="s2">日均 ' + weekdayAvg + ' 分钟</div></div>'
      + '<div class="tch-stat"><div class="lb">累计学习</div><div class="vl">' + bigMin(t.totalMinutes) + '</div>'
      + '<div class="s2">覆盖 ' + ((t.byModule || []).length) + ' 个模块</div></div>'
      + '<div class="tch-stat"><div class="lb">最近模考总分</div><div class="vl">' + esc(examVal) + '</div>'
      + '<div class="s2">' + esc(examSub) + '</div></div>'
      + '<div class="tch-stat"><div class="lb">待复习单词</div><div class="vl">' + (vb.dueToday || 0) + '<u>个</u></div>'
      + '<div class="s2">共 ' + (vb.total || 0) + ' 词 · 已掌握 ' + (vb.cleared || 0) + '</div></div>'
      + '</div>'
      + '<div class="tch-cols">'
      + '<div class="tch-panel"><div class="tch-ph"><b>成绩趋势</b><span class="r2">近 7 次模考总分</span></div>'
      + chartHtml(mocks)
      + '<p class="tch-note">写作批改分数另计，不进这条线。</p></div>'
      + '<div class="tch-panel"><div class="tch-ph"><b>词汇掌握度</b><span class="r2">' + (vb.total || 0) + ' 词</span></div>'
      + vocabHtml(vb) + '</div>'
      + '</div>'
      + '<div class="tch-panel"><div class="tch-ph"><b>学习时长</b><span class="r2">累计 · 按模块</span></div>'
      + barsHtml(t) + '</div>'
      + subsHtml();
  }

  function renderMain() {
    const err = S.err ? ('<div class="tch-errbar"><div><b>' + esc(S.err.title) + '</b>' + esc(S.err.desc || '') + '</div>'
      + '<div class="acts"><button type="button" data-act="retry">重试</button></div></div>') : '';
    const h = '<div class="tch-head">'
      + '<div><h1>学生数据</h1>'
      + '<div class="tch-desc">你绑定名单里的学生在站内的学习记录，只读查看，不能修改任何内容。</div></div>'
      + '<span class="tch-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>管理员视图 · 只读</span>'
      + '</div>'
      + '<div class="tch-body">'
      + '<aside class="tch-roster" id="tchRoster">' + rosterHtml() + '</aside>'
      + '<div class="tch-detail" id="tchDetail">' + err
      + (S.detailHtml ? S.detailHtml : (S.busy ? skeleton() : ''))
      + '</div></div>';
    paint(h);
    bindRosterSearch();
  }

  function paintDetail() {
    const d = document.getElementById('tchDetail');
    if (!d) { renderMain(); return; }
    d.innerHTML = (S.err ? ('<div class="tch-errbar"><div><b>' + esc(S.err.title) + '</b>' + esc(S.err.desc || '') + '</div>'
      + '<div class="acts"><button type="button" data-act="retry">重试</button></div></div>') : '')
      + (S.detailHtml || '');
  }

  /* ---------- 选人 / 拉数据 ---------- */
  async function select(email, opts) {
    opts = opts || {};
    if (!email) return;
    const same = email === S.cur && S.view;
    S.cur = email;
    document.querySelectorAll('.tch-ritem').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-email') === email);
    });
    const pickName = document.querySelector('.tch-pick .m b');
    if (pickName) pickName.textContent = shortEmail(email);
    if (same && !opts.force) return;
    try { history.replaceState(null, '', location.pathname + '?email=' + encodeURIComponent(email)); } catch (e) {}

    S.err = null;
    S.busy = true; S.view = null; S.detailHtml = skeleton();
    S.filter = 'all'; S.limit = 12;
    paintDetail();
    const r = await api('view=' + encodeURIComponent(email));
    S.busy = false;
    if (r.status === 401) { S.meDone = false; route(); return; }
    if (!r.ok || !r.j || !r.j.ok) {
      const code = (r.j && r.j.error) || '';
      if (code === 'no_data') {
        S.detailHtml = stateHtml({
          tone: 'warn', icon: IC.warn,
          title: '这个学生还没同步过数据',
          desc: '要学生在自己那边登录并打开一次站点，数据才会传到云端。',
          acts: '<button class="tch-btn ghost" type="button" data-act="retry">重试</button>'
        });
      } else if (code === 'forbidden') {
        S.detailHtml = stateHtml({
          tone: 'gray', icon: IC.lock,
          title: '这个学生不在你的名单里',
          desc: '名单可能刚被系统管理员改过，刷新一下再看。',
          acts: '<button class="tch-btn" type="button" data-act="reload">刷新名单</button>'
        });
      } else {
        S.err = { title: '这个学生的数据暂时读不出来', desc: (r.j && r.j.msg) ? r.j.msg + '（HTTP ' + r.status + '）' : 'HTTP ' + r.status + '，稍后再试。' };
        S.detailHtml = '';
      }
      paintDetail();
      return;
    }
    /* 昵称这次才拿到 → 名单里也顺手更新（避免「列表是邮箱、详情是真名」的割裂感） */
    S.view = r.j;
    S.detailHtml = detailHtml();
    const nick = (r.j.student && r.j.student.nickname) || '';
    if (nick) {
      const st = stuOf(email);
      if (st && !st.nickname) {
        st.nickname = nick;
        rosterWrapRefresh();
        bindRosterSearch();
      }
    }
    paintDetail();
  }

  /* 只重画名单（保留滚动位置与搜索词） */
  function rosterWrapRefresh() {
    const old = document.getElementById('tchRList');
    const scroll = old ? old.scrollTop : 0;
    const q = (document.getElementById('tchSearch') || {}).value || '';
    const html = '<div class="tch-head">'
      + '<div><h1>学生数据</h1>'
      + '<div class="tch-desc">你绑定名单里的学生在站内的学习记录，只读查看，不能修改任何内容。</div></div>'
      + '<span class="tch-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>管理员视图 · 只读</span>'
      + '</div>'
      + '<div class="tch-body">'
      + '<aside class="tch-roster" id="tchRoster">' + rosterHtml() + '</aside>'
      + '<div class="tch-detail" id="tchDetail">' + (S.detailHtml || '') + '</div></div>';
    const r = root();
    if (!r) return '';
    r.innerHTML = html;
    const list = document.getElementById('tchRList');
    if (list) list.scrollTop = scroll;
    const inp = document.getElementById('tchSearch');
    if (inp && q) { inp.value = q; filterRoster(q); }
    return '';
  }

  function filterRoster(q) {
    q = String(q || '').trim().toLowerCase();
    document.querySelectorAll('.tch-ritem').forEach(function (b) {
      const e = String(b.getAttribute('data-email') || '').toLowerCase();
      b.style.display = (!q || e.indexOf(q) >= 0) ? '' : 'none';
    });
  }
  function bindRosterSearch() {
    const inp = document.getElementById('tchSearch');
    if (!inp || inp.dataset.bound) return;
    inp.dataset.bound = '1';
    inp.addEventListener('input', function () { filterRoster(inp.value); });
  }

  /* ---------- 首屏 ---------- */
  async function route() {
    const r = root();
    if (!r) return;
    if (!token()) { noPerm('guest'); return; }

    if (!S.meDone) {
      paint('<div class="tch-skel" aria-hidden="true"><div class="skel-row"><span class="skel-av"></span>'
        + '<span class="skel-bar w42"></span></div><div class="skel-bar w66"></div>'
        + '<div class="skel-bar h72"></div><div class="skel-bar h96"></div></div>');
      const me = await api('action=me');
      if (me.status === 401) { noPerm('guest'); return; }
      const role = (me.j && me.j.role) || 'user';
      S.role = role;
      S.acct = (me.j && me.j.acct) || '';
      if (role !== 'teacher' && role !== 'root') { noPerm('user'); return; }
      S.meDone = true;
    }

    paint('<div class="tch-head"><div><h1>学生数据</h1>'
      + '<div class="tch-desc">你绑定名单里的学生在站内的学习记录，只读查看，不能修改任何内容。</div></div>'
      + '<span class="tch-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>管理员视图 · 只读</span></div>'
      + skeleton());

    const lst = await api('action=students');
    if (lst.status === 401) { noPerm('guest'); return; }
    if (!lst.ok || !lst.j || !lst.j.ok) {
      paint(stateHtml({
        tone: 'err', icon: IC.err,
        title: '名单没取到',
        desc: (lst.j && lst.j.msg ? lst.j.msg + '。' : '') + 'HTTP ' + lst.status + '。多半是网络问题，重试一次。',
        acts: '<button class="tch-btn" type="button" data-act="reload">重试</button>'
      }));
      return;
    }
    S.students = Array.isArray(lst.j.students) ? lst.j.students : [];
    if (!S.students.length) { emptyRoster(); return; }

    const want = new URLSearchParams(location.search).get('email') || '';
    const hit = S.students.find(function (s) { return s.email === want; });
    S.cur = (hit || S.students[0]).email;
    S.view = null; S.detailHtml = skeleton(); S.err = null;
    renderMain();
    select(S.cur, { force: true });
  }

  /* ---------- 事件（委托只绑一次；软导航会重新 eval 本文件，用 window 上的指针换成最新实例） ---------- */
  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (!document.getElementById('tchRoot')) return;

    const act = t.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'reload') { S.meDone = false; route(); return; }
      if (a === 'retry') { if (S.cur) select(S.cur, { force: true }); return; }
      if (a === 'more') { S.limit += 12; S.detailHtml = detailHtml(); paintDetail(); return; }
      if (a === 'sheet') { openSheet(); return; }
      if (a === 'sheet-close') { closeSheet(); return; }
      if (a === 'sheet-backdrop' && t === act) { closeSheet(); return; }
    }

    const item = t.closest('.tch-ritem');
    if (item) {
      const email = item.getAttribute('data-email');
      if (document.querySelector('.tch-sheet-ov')) closeSheet();
      select(email);
      return;
    }

    const fb = t.closest('[data-filter]');
    if (fb) {
      S.filter = fb.getAttribute('data-filter');
      S.limit = 12;
      S.detailHtml = detailHtml();
      paintDetail();
      return;
    }

    const sbtn = t.closest('.tch-sbtn');
    if (sbtn) {
      const row = sbtn.parentNode;
      const i = Number(row.getAttribute('data-i')) || 0;
      const list = subsFiltered();
      const s = list[i];
      const wasOpen = row.classList.contains('open');
      document.querySelectorAll('.tch-srow.open').forEach(function (x) {
        x.classList.remove('open');
        const b = x.querySelector('.tch-sbtn'); if (b) b.setAttribute('aria-expanded', 'false');
        const es = x.querySelector('.tch-essay'); if (es) es.remove();
        const br = x.querySelector('.tch-essay-bar'); if (br) br.remove();
      });
      if (wasOpen || !s) return;
      row.classList.add('open');
      sbtn.setAttribute('aria-expanded', 'true');
      const div = document.createElement('div');
      div.className = 'tch-essay';
      div.textContent = String(s.text || '');     // 🔴 textContent：学生写的东西里可能有 <script>
      const bar = document.createElement('div');
      bar.className = 'tch-essay-bar';
      const paras = String(s.text || '').split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length;
      bar.innerHTML = '<span>共 ' + Math.max(1, paras) + ' 段 · ' + String(s.text || '').length.toLocaleString('zh-CN') + ' 字符</span>'
        + '<span class="sp">只看原文 · 不能批注或修改</span>';
      row.appendChild(div);
      row.appendChild(bar);
    }
  }

  /* ---------- 手机端切换弹层 ---------- */
  function openSheet() {
    if (document.getElementById('tchSheetOv')) return;
    const ov = document.createElement('div');
    ov.className = 'tch-sheet-ov';
    ov.id = 'tchSheetOv';
    ov.setAttribute('data-act', 'sheet-backdrop');
    ov.innerHTML = '<div class="tch-sheet" role="dialog" aria-modal="true" aria-label="切换学生">'
      + '<div class="sh"><b>切换学生</b><button type="button" data-act="sheet-close">关闭</button></div>'
      + '<aside class="tch-roster">' + rosterHtml() + '</aside></div>';
    document.body.appendChild(ov);
    bindRosterSearch();
    const inp = document.getElementById('tchSearch');
    if (inp) setTimeout(function () { inp.focus(); }, 50);
  }
  function closeSheet() {
    const ov = document.getElementById('tchSheetOv');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }
  function onKey(e) { if (e.key === 'Escape') closeSheet(); }

  /* 只绑一次：软导航重进时本文件会再 eval 一遍，重复 addEventListener 会让
     「点一下展开」被执行两次（展开又立刻收起）。用 window 指针始终指向最新实例。 */
  if (!window.__TCH_BOUND) {
    window.__TCH_BOUND = true;
    document.addEventListener('click', function (e) { const a = window.__TCH_API; if (a && a.click) a.click(e); });
    document.addEventListener('keydown', function (e) { const a = window.__TCH_API; if (a && a.key) a.key(e); });
  }
  window.__TCH_API = { click: onClick, key: onKey };

  /* ---------- 启动（软导航会再 eval 一次，mount 幂等） ---------- */
  let mounted = false;
  function mount() {
    if (!document.getElementById('tchRoot')) return;
    if (mounted) return;
    mounted = true;
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
