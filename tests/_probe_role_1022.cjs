/* 10-21 三级角色权限（普通用户 / 管理员（机构教师）/ 系统管理员）验收探针 · 第一批
   用法：
     本地：node tests/_with_server.cjs tests/_probe_role_1022.cjs 8895
     直接：NODE_PATH="C:/Users/Camille/.workbuddy/binaries/node/workspace/node_modules" node tests/_probe_role_1022.cjs
     ⚠️ 不需要线上：本支**不联网、不碰生产 KV**，函数接口部分用内存 KV 跑真实 handler，站长台 UI 部分拦 /api/admin。
        道理：生产 /api/roles 要真 session token（要真注册账号 + 邮箱验证码），而且生产 KV 每天只有 1000 写 ——
        权限接口的判据必须能反复跑，所以走「真实 handler + 假 KV」这条路，比打线上更硬也更安全。

   ⚠️ 本支覆盖第一批：后端接口（roles/admin）+ 站长台「角色管理」区。
      第二批（teacher.html 老师端页面 + 导航入口）落地时，在文件末尾追加：
        ① 普通用户访问 teacher 页 → 无权限态（不白屏不报错）
        ⑤ 站长台授权后该账号刷新即出现老师入口（取消后入口消失）

   ---- 断言清单（对应交付要求的 5 条）----
   ④ 未登录访问 /api/roles 任意 action → 401（无凭证 / 假 token / 非法 token 三种）
   ② 老师访问未绑定的学生 → 403
   ③ 老师访问已绑定的学生 → 200，且**逐字段断言**不含 token / settings / 服药 / relayToken，词汇不逐词下发
   ⑤ 站长台 role_set 授权后立刻生效（me 变 teacher、students 可读），取消后立刻 403（不等缓存）
   ① 普通用户访问老师接口 → 403（页面级在第二批） */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8895';
const REPO = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  ✓ ' + n + (d !== undefined ? '  ' + d : '')); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  <<< ' + JSON.stringify(d) : '')); }
};

/* ══════════════════ A. 接口层（真实 handler + 内存 KV） ══════════════════ */
async function apiPart() {
  const TMP = path.join(os.tmpdir(), '_probe_role_1022');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const cp = (src, dst, patch) => {
    let s = fs.readFileSync(path.join(REPO, src), 'utf8');
    if (patch) s = patch(s);
    fs.writeFileSync(path.join(TMP, dst), s);
  };
  /* 复制成 .mjs 才能被 Node 当 ESM 加载（仓库没设 type:module） */
  cp('functions/api/auth.js', '_auth.mjs');
  cp('functions/api/roles.js', '_roles.mjs', s => s.replace("from './auth.js'", "from './_auth.mjs'"));
  cp('functions/api/admin.js', '_admin.mjs');
  const rolesMod = await import(pathToFileURL(path.join(TMP, '_roles.mjs')).href);
  const adminMod = await import(pathToFileURL(path.join(TMP, '_admin.mjs')).href);

  class KV {
    constructor() { this.m = new Map(); this.writes = 0; }
    async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
    async put(k, v) { this.writes++; this.m.set(k, String(v)); }
    async delete(k) { this.writes++; this.m.delete(k); }
    async list({ prefix } = {}) {
      const keys = [...this.m.keys()].filter(k => !prefix || k.startsWith(prefix)).sort();
      return { keys: keys.map(name => ({ name })), list_complete: true };
    }
  }
  const kv = new KV();
  const env = { SYNC_KV: kv, ADMIN_KEY: 'probe-admin-key' };

  /* 夹具：拿她 10/01 的真实云端 blob 当学生数据（1.6MB，含 721 条计时 / 84 条模考 / 1784 个词） */
  const blobFile = path.join(REPO, 'tests/_data_backup_2026-10-18/_her_blob_1001.json');
  const blobObj = JSON.parse(fs.readFileSync(blobFile, 'utf8'));
  const data = blobObj.data || blobObj;
  data.settings = data.settings || {};
  data.settings.name = '探针学生';
  data.settings.relayToken = 'sk-PROBE-SECRET';   // 敏感字段：必须不出现在老师回包里
  data.settings.adhd = true;                       // 服药开关：同上

  const STUDENT = 'probe.student@test.com';
  const TEACHER = 'probe.teacher@test.com';
  const OTHER = 'probe.other@test.com';
  const NORMAL = 'probe.normal@test.com';
  const T = { student: 'a'.repeat(32), teacher: 'b'.repeat(32), other: 'c'.repeat(32), normal: 'd'.repeat(32) };
  for (const k in T) await kv.put('sess:' + T[k], JSON.stringify({ acct: { student: STUDENT, teacher: TEACHER, other: OTHER, normal: NORMAL }[k] }));
  for (const e of [STUDENT, TEACHER, OTHER, NORMAL]) await kv.put('user:e:' + e, JSON.stringify({ email: e, via: 'email', created: 1780000000000, salt: 's', hash: 'h' }));
  await kv.put('sync:e:' + STUDENT, JSON.stringify({ data, ts: Date.now() }));
  await kv.put('meta:e:' + STUDENT, JSON.stringify({ ts: 1790000000000, bytes: 0, hash: 'x' }));

  const call = async (url, sid) => {
    const h = new Headers();
    if (sid) h.set('X-Session', sid);
    const res = await rolesMod.onRequest({ request: new Request('https://x.test' + url, { headers: h }), env });
    let body = null;
    try { body = JSON.parse(await res.clone().text()); } catch (e) {}
    return { status: res.status, body, cc: res.headers.get('cache-control') };
  };
  const admin = async (payload) => {
    const res = await adminMod.onRequest({
      request: new Request('https://x.test/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': env.ADMIN_KEY },
        body: JSON.stringify(payload),
      }), env,
    });
    let body = null;
    try { body = JSON.parse(await res.clone().text()); } catch (e) {}
    return { status: res.status, body };
  };

  console.log('\n[④] 未登录访问 /api/roles 任意 action → 401');
  for (const u of ['/api/roles?action=me', '/api/roles?action=students', '/api/roles?view=' + STUDENT]) {
    const a = await call(u);
    ok('无凭证 ' + u, a.status === 401, a.status);
    const b = await call(u, 'f'.repeat(32));
    ok('假 token ' + u, b.status === 401, b.status);
    const c = await call(u, 'not-a-token');
    ok('非法 token ' + u, c.status === 401, c.status);
  }

  console.log('\n[①] 普通用户越权（页面级在第二批，这里先钉接口）');
  let r = await call('/api/roles?action=me', T.normal);
  ok('普通用户 me → role=user', r.status === 200 && r.body.role === 'user', r.body);
  ok('me 禁缓存（取消角色才能立刻生效）', /no-store/.test(r.cc || ''), r.cc);
  r = await call('/api/roles?action=students', T.normal);
  ok('普通用户 students → 403', r.status === 403, r.status);
  r = await call('/api/roles?view=' + STUDENT, T.normal);
  ok('普通用户 view → 403', r.status === 403, r.status);

  console.log('\n[⑤] 站长台授权：写量 / 立即生效');
  r = await admin({ action: 'role_set', acct: 'nobody@test.com', role: 'teacher' });
  ok('未注册邮箱不能授权（防手滑）', r.status === 404, r.body);
  r = await admin({ action: 'role_set', acct: TEACHER, role: 'king' });
  ok('非法角色被拒', r.status === 400, r.body);
  let w0 = kv.writes;
  r = await admin({ action: 'role_set', acct: TEACHER, role: 'teacher' });
  ok('设为管理员（teacher）', r.status === 200 && r.body.role === 'teacher', r.body);
  ok('一次授权写量 ≤ 2（角色键 + 审计）', kv.writes - w0 <= 2, kv.writes - w0);
  r = await admin({ action: 'bind_set', acct: OTHER, students: [STUDENT] });
  ok('非管理员不能建名单', r.status === 400 && r.body.error === 'bad_role', r.body);
  r = await admin({ action: 'bind_set', acct: TEACHER, students: [STUDENT.toUpperCase(), STUDENT, 'bad-email'] });
  ok('名单里非法邮箱被拒', r.status === 400 && r.body.error === 'bad_student', r.body);
  w0 = kv.writes;
  r = await admin({ action: 'bind_set', acct: TEACHER, students: [STUDENT, 'second@test.com'] });
  ok('绑定 2 个学生', r.status === 200 && r.body.students.length === 2, r.body);
  ok('一次绑定写量 ≤ 2', kv.writes - w0 <= 2, kv.writes - w0);
  r = await call('/api/roles?action=me', T.teacher);
  ok('授权后同一 token 立刻变 teacher（不等缓存）', r.body.role === 'teacher', r.body);
  r = await call('/api/roles?action=students', T.teacher);
  ok('老师 students → 200 且 2 个学生', r.status === 200 && (r.body.students || []).length === 2, r.body && r.body.students);
  const sKeys = Object.keys((r.body.students || [])[0] || {}).sort().join(',');
  ok('学生列表只回 email / nickname / lastActive', sKeys === 'email,lastActive,nickname', sKeys);
  /* 10-22 第二批（她批的「推荐 ④」）：名单**不再读学生云端 blob**，nickname 恒为空串，
     前端列表显示邮箱前缀、昵称进 view= 才回。这样 50 人名单 = 0 次大 IO，不会超时。 */
  ok('学生列表不读昵称（列表零 blob IO，昵称改由 view= 回）', ((r.body.students || [])[0] || {}).nickname === '', (r.body.students || [])[0]);
  ok('学生列表带最近活跃', ((r.body.students || [])[0] || {}).lastActive === 1790000000000, (r.body.students || [])[0]);

  console.log('\n[②] 老师访问未绑定的学生 → 403');
  r = await call('/api/roles?view=someone-else@test.com', T.teacher);
  ok('未绑定学生 403', r.status === 403, r.status);
  r = await call('/api/roles?view=second@test.com', T.teacher);
  ok('已绑但没云端数据 → 404（不是 200 空壳）', r.status === 404, r.status);

  console.log('\n[③] 老师访问已绑学生 → 200 + 逐字段白名单');
  r = await call('/api/roles?view=' + STUDENT, T.teacher);
  ok('已绑定学生 200', r.status === 200, r.status);
  const v = r.body || {};
  ok('四块数据都在（成绩 / 时长 / 词汇 / 提交）',
    !!(v.scores && v.scores.mock && v.scores.mock.length) &&
    !!(v.time && v.time.byModule && v.time.byModule.length && v.time.totalMinutes > 0) &&
    !!(v.vocab && v.vocab.total > 0 && v.vocab.levels && v.vocab.levels.length === 8) &&
    !!(v.submissions && v.submissions.length), {
      mock: v.scores && v.scores.mock && v.scores.mock.length,
      mods: v.time && v.time.byModule && v.time.byModule.length,
      words: v.vocab && v.vocab.total,
      subs: v.submissions && v.submissions.length,
    });
  const raw = JSON.stringify(v);
  ['relayToken', 'sk-PROBE-SECRET', 'settings', 'adhd', 'meds', 'sessions',
    'hub_auth_token', 'refreshToken', '"words"', 'textbook', 'speakingStories'].forEach(bad => {
    ok('回包不含 ' + bad, raw.indexOf(bad) < 0, raw.indexOf(bad));
  });
  ok('词汇只给各级词量（不逐词下发）', raw.indexOf('"en"') < 0);
  const top = Object.keys(v).sort().join(',');
  ok('回包顶层字段锁死（ok/student/scores/time/vocab/submissions/generatedAt）',
    top === 'generatedAt,ok,scores,student,submissions,time,vocab', top);
  ok('口语提交含原文', v.submissions.some(x => x.kind === 'speaking' && String(x.text || '').length > 0));
  ok('写作提交含原文', v.submissions.some(x => x.kind === 'writing' && String(x.text || '').length > 0));

  console.log('\n[⑤] 取消角色：立刻 403（不等缓存）');
  w0 = kv.writes;
  r = await admin({ action: 'role_set', acct: TEACHER, role: '' });
  ok('取消角色 200', r.status === 200 && r.body.role === '', r.body);
  ok('一次取消写量 ≤ 2', kv.writes - w0 <= 2, kv.writes - w0);
  r = await call('/api/roles?action=me', T.teacher);
  ok('取消后 me 立刻回 user', r.body.role === 'user', r.body);
  r = await call('/api/roles?view=' + STUDENT, T.teacher);
  ok('取消后 view 立刻 403', r.status === 403, r.status);
  r = await call('/api/roles?action=students', T.teacher);
  ok('取消后 students 立刻 403', r.status === 403, r.status);

  console.log('\n[附加] root 边界 + 审计 + 概览');
  await admin({ action: 'role_set', acct: OTHER, role: 'root' });
  r = await call('/api/roles?view=' + STUDENT, T.other);
  ok('root 看非自己名单的学生也 403（看得越细层级越低）', r.status === 403, r.status);
  r = await call('/api/roles?action=me', T.other);
  ok('root 自己 → role=root', r.body.role === 'root', r.body);
  const acts = [...kv.m.keys()].filter(k => k.startsWith('audit:')).map(k => JSON.parse(kv.m.get(k)).act);
  ok('授权/取消/绑名单都有审计', ['role_set', 'role_revoke', 'bind_set'].every(a => acts.indexOf(a) >= 0), acts);
  r = await admin({ action: 'overview' });
  ok('概览带角色清单', Array.isArray(r.body.roles) && r.body.roles.length >= 1, r.body && r.body.roles);
}

/* ══════════════════ B. 站长台「角色管理」区（拦截 /api/admin） ══════════════════ */
async function uiPart() {
  const { chromium } = require('playwright-core');
  const now = Date.now();
  const PAYLOAD = {
    ok: true, day: '2026-10-21', week: '2026-W43', month: '2026-10', tookMs: 900, kvReads: 120,
    sessCount: 3, aiToday: 0, aiWeek: 0, aiMonth: 0, nReal: 1, nProbe: 0, nIdle: 0,
    priceOk: true, costMonth: 0, costMonthReal: 0, aiMonthReal: 0, fbUnread: 0, trend: [],
    users: [{ acct: 'probe.normal@test.com', created: now - 86400000 }],
    invites: [], vips: [{ acct: 'probe.student@test.com', type: 'base', expire: now + 86400000 * 20, daysLeft: 20, note: '' }],
    audits: [], feedbacks: [], tokByAcct: {}, usage: {}, usageWeek: {}, usageMonth: {}, byService: [],
    trendTotals: { calls: 0, tok: 0, cost: 0 }, todayModel: '',
    roles: [
      { acct: 'probe.teacher@test.com', role: 'teacher', students: ['probe.student@test.com', 'second@test.com'] },
      { acct: 'probe.root@test.com', role: 'root', students: [] },
    ],
  };
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  const sent = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route('**/api/admin', async r => {
    try {
      const body = JSON.parse(r.request().postData() || '{}');
      sent.push(body);
      if (body.action === 'overview') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acct: body.acct, role: body.role, students: body.students || [] }) });
    } catch (e) { return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  });
  await p.addInitScript(() => { try { sessionStorage.setItem('hub_admin_key', 'TEST'); } catch (e) {} });
  await p.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  try { await p.fill('#keyInput', 'TEST'); await p.click('#gateBtn'); } catch (e) {}
  await sleep(1800);

  const dom = await p.evaluate(() => {
    const need = ['roleAcct', 'roleKind', 'roleSetBtn', 'roleClearBtn', 'roleBody', 'bindAcct', 'bindList', 'bindSaveBtn'];
    const all = [...document.querySelectorAll('[id]')].map(e => e.id);
    return {
      missing: need.filter(id => !document.getElementById(id)),
      dup: all.filter((v, i) => all.indexOf(v) !== i),
      rows: document.querySelectorAll('#roleBody tr').length,
      bodyTxt: (document.getElementById('roleBody') || {}).textContent || '',
      emptyShown: (document.getElementById('roleEmpty') || {}).style.display,
    };
  });
  ok('角色管理 8 个 id 都在', dom.missing.length === 0, dom.missing.join(','));
  ok('全页没有重复 id', dom.dup.length === 0, dom.dup.join(','));
  ok('两名管理员各一行', dom.rows === 2, dom.rows);
  ok('行里显示账号与「2 人」绑定数', /probe\.teacher@test\.com/.test(dom.bodyTxt) && /2 人/.test(dom.bodyTxt), dom.bodyTxt.slice(0, 120));
  ok('空态条已隐藏', dom.emptyShown === 'none', dom.emptyShown);

  /* 点「编辑学生」→ 名单灌进输入框 */
  await p.evaluate(() => { document.querySelector('#roleBody [data-bind]').click(); });
  await sleep(300);
  const filled = await p.evaluate(() => ({
    acct: document.getElementById('bindAcct').value,
    list: document.getElementById('bindList').value,
  }));
  ok('编辑学生：管理员邮箱回填', filled.acct === 'probe.teacher@test.com', filled.acct);
  ok('编辑学生：名单每行一个回填', filled.list.split('\n').length === 2, JSON.stringify(filled.list));

  /* 保存名单 → 发出的 payload 必须是数组 */
  await p.evaluate(() => {
    document.getElementById('bindList').value = 'probe.student@test.com\nnew.student@test.com\n';
    document.getElementById('bindSaveBtn').click();
  });
  await sleep(700);
  const bindReq = sent.filter(x => x.action === 'bind_set').pop();
  ok('保存名单走 bind_set', !!bindReq, bindReq);
  ok('名单按行解析成数组（2 条）', !!bindReq && Array.isArray(bindReq.students) && bindReq.students.length === 2, bindReq && bindReq.students);

  /* 设为角色 / 取消角色 */
  await p.evaluate(() => {
    document.getElementById('roleAcct').value = 'probe.normal@test.com';
    document.getElementById('roleKind').value = 'teacher';
    document.getElementById('roleSetBtn').click();
  });
  await sleep(700);
  const setReq = sent.filter(x => x.action === 'role_set').pop();
  ok('设为该角色走 role_set + 角色值正确', !!setReq && setReq.role === 'teacher' && setReq.acct === 'probe.normal@test.com', setReq);
  p.on('dialog', d => d.accept());
  await p.evaluate(() => { document.querySelector('#roleBody [data-roleclear]').click(); });
  await sleep(700);
  const clearReq = sent.filter(x => x.action === 'role_set' && x.role === '').pop();
  ok('取消角色走 role_set + role 为空（不是新开接口）', !!clearReq && clearReq.acct === 'probe.teacher@test.com', clearReq);

  /* 401 提示：非法邮箱不发请求 */
  const before = sent.length;
  await p.evaluate(() => {
    document.getElementById('roleAcct').value = 'not-an-email';
    document.getElementById('roleSetBtn').click();
  });
  await sleep(400);
  const errTxt = await p.evaluate(() => document.getElementById('roleErr').textContent);
  ok('非法邮箱前端拦下不发请求 + 有报错文案', sent.length === before && /邮箱/.test(errTxt), errTxt);

  ok('桌面零 JS 报错', errs.length === 0, errs.join(' | '));

  /* 手机 390 */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e).slice(0, 120)));
  await p2.route('**/api/admin', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }));
  await p2.addInitScript(() => { try { sessionStorage.setItem('hub_admin_key', 'TEST'); } catch (e) {} });
  await p2.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await sleep(1400);
  try { await p2.fill('#keyInput', 'TEST'); await p2.click('#gateBtn'); } catch (e) {}
  await sleep(1600);
  const mob = await p2.evaluate(() => ({
    overflow: document.body.scrollWidth - document.documentElement.clientWidth,
    roleRows: document.querySelectorAll('#roleBody tr').length,
  }));
  ok('手机 390 无横向溢出', mob.overflow <= 0, 'overflow=' + mob.overflow);
  ok('手机角色表也渲染出来', mob.roleRows === 2, mob.roleRows);
  ok('手机零 JS 报错', errs2.length === 0, errs2.join(' | '));

  await b.close();
}

(async () => {
  try { await apiPart(); } catch (e) { fail++; console.log('  ✗ 接口层异常：' + (e && e.message)); }
  try { await uiPart(); } catch (e) { fail++; console.log('  ✗ 站长台 UI 层异常：' + (e && e.message)); }
  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
})();
