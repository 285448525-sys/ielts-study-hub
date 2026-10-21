// Cloudflare Pages Function: /api/roles —— 三级角色权限（普通用户 / 管理员（机构教师）/ 系统管理员）
//
// ⭐ 2026-10-21 她拍板（导师要求每个系统至少三类权限，且上级能指定和取消下级）：
//   普通用户 = 现有注册考生（role 缺省即此层）
//   管理员（机构教师）= 由系统管理员指定；可绑定学生账号、只读查看学生学习数据与练习提交；
//                       不参与系统配置、不能改任何账号权限
//   系统管理员 = 现有站长台 admin.html；可指定与取消管理员、开通收回会员、账号身份判定、查看运行概览
//
// ⚠️ 角色**不进 DATA**：DATA 整份上云、会被云同步覆盖（用户可改本地数据）→ 权限必须只存服务端。
//   角色写入只发生在站长台授权/取消那一刻（functions/api/admin.js 的 role_set / bind_set），
//   本文件**只读不写**，零 KV 写 → 不增加每日 1000 次写的压力。
//
// KV 键（SYNC_KV）：
//   role:<email>       'teacher' | 'root'         —— 无此键 = 普通用户
//   bind:<teacherEmail> ["student@x.com", ...]    —— 该管理员绑定的学生邮箱数组
//
// 接口（鉴权口径与 /api/sync 完全一致：X-Session 头 → sess:<token> → email）：
//   GET  /api/roles?action=me        → { ok, acct, role }
//   GET  /api/roles?action=students  → { ok, students:[{email,nickname,lastActive}] }
//        只回邮箱 + 最近活跃时间（nickname 恒为空串，10-22 起列表不再读学生 blob）；
//        **绝不回任何学习数据**。
//   GET  /api/roles?view=<email>     → 老师看学生（只读；必须在自己 bind 列表内）
//       回包只搬白名单字段：成绩记录（分数与时间）/ 学习时长（按模块）/ 词汇掌握度（各级词量统计）/
//       口语与写作提交原文（教学批改必要）。**绝不整包透传 DATA**，绝不回 token / settings（含服药）/ relayToken。
//
// 🔴 安全铁律（fail closed）：无凭证、token 解析失败、角色读不到、任何未捕获异常 → 一律按无权限处理；
//   绝不「查不到就放行」。本文件不含任何写学生数据的路径。
//
// 账号格式：直接复用 /api/auth 的 ACCT_RE 与 acctKey()（**不在本文件重写正则**，
//   历史上三处拷贝不同步 → 401 → token 被清）。

import { ACCT_RE, acctKey } from './auth.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Session',
  'access-control-max-age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      // 🔴 角色必须「取消即生效」：一旦被缓存，取消管理员后入口还会挂着 → 明确 no-store
      'cache-control': 'no-store',
    }, CORS),
  });
}

/* 从 X-Session（sendBeacon 兜底 ?session=）解出邮箱；任何异常都返回空串（fail closed） */
async function sessionEmail(request, env) {
  try {
    const url = new URL(request.url);
    const sid = (request.headers.get('X-Session') || url.searchParams.get('session') || '').trim();
    if (!sid || !/^[0-9a-f]{32,128}$/.test(sid)) return '';
    const raw = await env.SYNC_KV.get('sess:' + sid);
    if (!raw) return '';
    const s = JSON.parse(raw);
    const a = String((s && s.acct) || '').trim().toLowerCase();
    return ACCT_RE.test(a) ? a : '';
  } catch (e) { return ''; }
}

/* 读角色。只认两个合法值，其余（含读失败）一律当普通用户 —— 升级靠站长台显式写，不靠推断 */
async function roleOf(kv, email) {
  if (!email) return '';
  try {
    const r = String((await kv.get('role:' + email)) || '');
    return (r === 'teacher' || r === 'root') ? r : '';
  } catch (e) { return ''; }
}

/* 读绑定学生列表（只保留合法邮箱、去重、限 50 个） */
async function bindOf(kv, email) {
  if (!email) return [];
  try {
    const arr = JSON.parse((await kv.get('bind:' + email)) || '[]');
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const x of arr) {
      const e = String(x || '').trim().toLowerCase();
      if (!ACCT_RE.test(e) || out.indexOf(e) >= 0) continue;
      out.push(e);
      if (out.length >= 50) break;
    }
    return out;
  } catch (e) { return []; }
}

/* 邮箱账号 → 云端数据键（与 /api/auth 的 acctKey() 同族；数据键由 /api/sync 写） */
function syncKeyOf(email) { return 'sync:e:' + String(email || '').trim().toLowerCase(); }
function metaKeyOf(email) { return 'meta:e:' + String(email || '').trim().toLowerCase(); }

/* ── 白名单视图构建（老师看学生）──────────────────────────────────────────
   只搬这四类，字段全部显式点出来 —— 不 Object.assign(data)、不透传任何整包。 */
function buildView(D) {
  const arr = (v) => Array.isArray(v) ? v : [];
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : (isFinite(parseFloat(v)) ? parseFloat(v) : null);
  const day = (s) => String(s || '').slice(0, 10);

  /* ① 成绩记录：模考（题库自动记 + 手工录）、写作 AI 批改 */
  const mock = arr(D.mockRecords).filter(r => r && r.date).slice(0, 60).map(r => ({
    date: day(r.date),
    type: String(r.type || ''),
    granularity: String(r.granularity || ''),
    overall: (r.overall != null && isFinite(Number(r.overall))) ? Number(r.overall) : null,
    parts: arr(r.parts).slice(0, 8).map(p => ({
      label: String((p && p.label) || ''),
      correct: Number((p && p.correct) || 0),
      total: Number((p && p.total) || 0),
    })),
    usedSec: Number(r.usedSec || 0),
  }));
  const manual = arr(D.scores).filter(s => s && s.date).slice(0, 30).map(s => ({
    date: day(s.date),
    listening: num(s.listening), reading: num(s.reading), writing: num(s.writing), speaking: num(s.speaking),
  }));
  const writing = arr(D.writingScores).filter(w => w && w.date).slice(0, 40).map(w => {
    const res = (w.result && typeof w.result === 'object') ? w.result : null;
    return {
      date: day(w.date),
      title: String(w.tplTitle || w.topic || w.type || ''),
      overall: (res && res.overall != null && isFinite(Number(res.overall))) ? Number(res.overall) : null,
      hasEssay: !!(w.essay && String(w.essay).trim()),
    };
  });

  /* ② 学习时长：按模块聚合 + 近 7 天合计（sessions 是计时表落库的唯一来源） */
  const sessions = arr(D.sessions).filter(s => s && s.startTs);
  const byModule = {};
  let totalSec = 0;
  const nowMs = Date.now();
  let weekSec = 0;
  for (const s of sessions) {
    const sec = Number(s.durationSec || 0);
    if (!(sec > 0)) continue;
    const name = String(s.moduleName || s.moduleId || '其他').slice(0, 20);
    byModule[name] = (byModule[name] || 0) + sec;
    totalSec += sec;
    if (nowMs - Number(s.startTs || 0) <= 7 * 86400000) weekSec += sec;
  }
  const time = {
    totalMinutes: Math.round(totalSec / 60),
    weekMinutes: Math.round(weekSec / 60),
    byModule: Object.keys(byModule)
      .map(k => ({ module: k, minutes: Math.round(byModule[k] / 60) }))
      .filter(x => x.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12),
  };

  /* ③ 词汇掌握度：**只下发各级词量统计，不逐词下发**（她/老师的诉求是掌握度，不是词表） */
  const words = arr(D.words).filter(w => w && w.en);
  const levelNames = ['0 新词', '1', '2', '3', '4', '5', '6', '7 长期'];
  const lv = [0, 0, 0, 0, 0, 0, 0, 0];
  let clearedN = 0, dueN = 0;
  const today = (function () {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();
  for (const w of words) {
    let L = Number(w.level);
    if (!isFinite(L)) L = 0;
    L = Math.max(0, Math.min(7, Math.round(L)));
    lv[L]++;
    if (w.cleared === true) clearedN++;
    if (w.nextReview && String(w.nextReview) <= today) dueN++;
  }
  const vocab = {
    total: words.length,
    cleared: clearedN,
    dueToday: dueN,
    levels: lv.map((count, i) => ({ level: i, name: levelNames[i], count: count })),
  };

  /* ④ 练习提交原文：口语（题库每题的作答）+ 写作（批改过的作文）
     ⚠️ 这两类含原文，是老师批改的必需品；除此之外一个字都不多给。 */
  const subs = [];
  for (const s of arr(D.speaking)) {
    if (!s || !s.answers || typeof s.answers !== 'object') continue;
    const title = String(s.titleZh || s.titleEn || s.id || '').slice(0, 60);
    for (const k of Object.keys(s.answers)) {
      const a = s.answers[k];
      if (!a || typeof a !== 'object') continue;
      const text = String(a.text || '').trim();
      if (!text) continue;
      subs.push({
        kind: 'speaking',
        part: (k === 'p2') ? 'P2' : String(s.type || 'P1'),
        title: (k === 'p2') ? title : (title + ' · 第 ' + (parseInt(k, 10) + 1) + ' 题'),
        ts: Number(a.ts || 0),
        text: text.slice(0, 4000),
      });
    }
  }
  for (const w of arr(D.writingScores)) {
    if (!w) continue;
    const essay = String(w.essay || '').trim();
    if (!essay) continue;
    subs.push({
      kind: 'writing',
      part: String(w.mode === 'template' ? '模板' : (w.type || 'Task')),
      title: String(w.tplTitle || w.topic || '写作提交').slice(0, 60),
      ts: Date.parse(String(w.date || '').replace(/-/g, '/')) || 0,
      text: essay.slice(0, 8000),
    });
  }
  subs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const submissions = subs.slice(0, 120);

  return { scores: { mock: mock, manual: manual, writing: writing }, time: time, vocab: vocab, submissions: submissions };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503);

    const url = new URL(request.url);
    const acct = await sessionEmail(request, env);
    /* 无凭证 / token 过期 / 解析失败 → 401（与 /api/sync 同口径，前端据此回登录页） */
    if (!acct) return json({ ok: false, error: 'unauthorized', msg: '未登录或登录已过期，请重新登录' }, 401);

    const kv = env.SYNC_KV;
    const role = await roleOf(kv, acct);

    const action = String(url.searchParams.get('action') || '').trim();
    const viewEmail = String(url.searchParams.get('view') || '').trim().toLowerCase();

    /* ── 自己的角色（登录后全站判断入口用；普通用户也允许调，回 role:'user'）── */
    if (action === 'me' || (!action && !viewEmail)) {
      return json({ ok: true, acct: acct, role: role || 'user' });
    }

    /* 以下全部要求 teacher / root —— 普通用户 403（fail closed，绝不因为读不到角色就放行） */
    if (!role) return json({ ok: false, error: 'forbidden', msg: '没有查看权限' }, 403);

    /* ── 绑定学生列表：只回邮箱 + 最近活跃，不回任何学习数据 ──
       🔴 10-22 第二批（她批的「推荐 ④」）：**列表不读学生云端 blob**。
       初版为了拿昵称会对每个学生 get 一次 sync blob（已 MB 级）→ 50 人 = 50 次大 IO，必然超时。
       现在列表只给「邮箱 + 最近活跃时间」，昵称由前端显示邮箱前缀；
       真实昵称在 view=<email> 里回（那时本来就要读整份数据，顺便就有）。
       meta / user 两个键都是几十字节的小键，读它们不心疼。 */
    if (action === 'students') {
      const list = await bindOf(kv, acct);
      const out = [];
      for (const e of list) {
        let lastActive = 0;
        try {
          const mRaw = await kv.get(metaKeyOf(e));
          if (mRaw) { const m = JSON.parse(mRaw); lastActive = Number(m && m.ts) || 0; }
        } catch (err) { /* 读不到活跃时间不影响列表 */ }
        try {
          if (!lastActive) {
            /* 没有 meta（从没上传过）→ 用注册时间兜底，避免列表显示「—」 */
            const u = JSON.parse((await kv.get(acctKey(e))) || 'null');
            lastActive = Number(u && u.created) || 0;
          }
        } catch (err) {}
        out.push({ email: e, nickname: '', lastActive: lastActive });
      }
      return json({ ok: true, acct: acct, role: role, students: out });
    }

    /* ── 老师看学生（只读）── */
    if (viewEmail) {
      if (!ACCT_RE.test(viewEmail)) return json({ ok: false, error: 'bad_acct', msg: '学生账号格式不对' }, 400);
      const allowed = await bindOf(kv, acct);
      /* 🔴 先校验绑定关系：不在自己名单里的一律 403。root 也不例外 ——
         「看得越细，层级越低」，系统管理员看运行概览，不看学生原文。 */
      if (allowed.indexOf(viewEmail) < 0) {
        return json({ ok: false, error: 'forbidden', msg: '这个学生不在你的名单里' }, 403);
      }
      const raw = await kv.get(syncKeyOf(viewEmail));
      if (!raw) return json({ ok: false, error: 'no_data', msg: '这个学生还没有云端学习数据' }, 404);
      let D = null;
      try {
        const o = JSON.parse(raw);
        D = (o && o.data && typeof o.data === 'object') ? o.data : null;
      } catch (e) { D = null; }
      /* 解析不出来 = 拿不到可信数据 → 不返回半截视图（fail closed） */
      if (!D) return json({ ok: false, error: 'bad_data', msg: '学生数据暂时读不出来，稍后再试' }, 502);

      const view = buildView(D);
      const nick = (D.settings && typeof D.settings.name === 'string') ? String(D.settings.name).slice(0, 40) : '';
      return json({
        ok: true,
        student: { email: viewEmail, nickname: nick },
        scores: view.scores,
        time: view.time,
        vocab: view.vocab,
        submissions: view.submissions,
        generatedAt: Date.now(),
      });
    }

    return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
  } catch (err) {
    /* 🔴 fail closed：异常一律按无权限，绝不「出错就放行」 */
    return json({ ok: false, error: 'forbidden', msg: '没有查看权限' }, 403);
  }
}
