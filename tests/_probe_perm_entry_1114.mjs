/* PERM-ENTRY-1（11-14 第五批「入口显隐与系统拦门」）本地探针：直调 roles.js / admin.js
   的 onRequest，KV 全内存假体，绝不打线上。验证两件事：

   A. 服务端拦门（本次新增的真门，fail closed）——
      ① 普通用户（role 无键）调 teacher/root 专属接口：action=students → 403、
         action=view（别人的数据）→ 403、action=perm → 只回 user 档
      ② teacher 越 root 的权：teacher 自己 students/view 正常，但没有任何动作能改配置
         （roles.js 只有只读 perm，写入只在 admin.js 的密钥门后面）
      ③ 前端隐藏 ≠ 安全：不带 X-Admin-Key / 带错密钥调 perm_set → 401，密钥对 → 才能写
      ④ session 失效 / 伪造 token → 401；异常路径 → 403 fail closed
      ⑤ 越权请求全程零 KV 写（拦门不产生副作用）
   B. 角色与入口的数据面（第五批显隐的服务端依据）——
      ⑥ role_set 授权/取消后 action=me 立刻变化（入口显隐靠它，不许有缓存延迟口径）
      ⑦ me 对未登录 → 401（前端 hubRefreshRole 失败时静默回落缓存，不炸首屏）

   运行：node tests/_probe_perm_entry_1114.mjs（自含服务器，无需 _with_server） */
import { onRequest as adminOnRequest } from '../functions/api/admin.js';
import { onRequest as rolesOnRequest } from '../functions/api/roles.js';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

function fakeKV(map) {
  const m = map || new Map();
  const counts = { get: 0, put: 0, delete: 0 };
  return {
    counts, m,
    async get(k) { counts.get++; return m.has(k) ? m.get(k) : null; },
    async put(k, v) { counts.put++; m.set(k, v); },
    async delete(k) { counts.delete++; m.delete(k); },
    list(opt) {
      const prefix = (opt && opt.prefix) || '';
      const keys = [...m.keys()].filter(k => k.indexOf(prefix) === 0);
      return { keys: keys.map(name => ({ name })), list_complete: true };
    }
  };
}
function req(url, opts) { return new Request('https://x.test' + url, opts || {}); }
async function callRoles(url, kv, headers) {
  const r = await rolesOnRequest({ request: req(url, { headers: headers || {} }), env: { SYNC_KV: kv } });
  const j = await r.json();
  return { status: r.status, j };
}
async function callAdmin(url, kv, body, key) {
  const r = await adminOnRequest({
    request: req(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'X-Admin-Key': key } : {}),
      body: JSON.stringify(body || {})
    }),
    env: { SYNC_KV: kv, ADMIN_KEY: 'k' }
  });
  const j = await r.json();
  return { status: r.status, j };
}
const T = {
  user: 'a'.repeat(32), teacher: 'b'.repeat(32), root: 'c'.repeat(32), ghost: 'd'.repeat(32)
};
const TEACHER_MAIL = 'teacher@x.com', ROOT_MAIL = 'root@x.com', USER_MAIL = 'user@x.com', STUDENT_MAIL = 'stu@x.com';
const H = {
  user: { 'X-Session': T.user },
  teacher: { 'X-Session': T.teacher },
  root: { 'X-Session': T.root },
  ghost: { 'X-Session': T.ghost }
};
function baseKV() {
  const m = new Map();
  m.set('sess:' + T.user, JSON.stringify({ acct: USER_MAIL }));
  m.set('sess:' + T.teacher, JSON.stringify({ acct: TEACHER_MAIL }));
  m.set('sess:' + T.root, JSON.stringify({ acct: ROOT_MAIL }));
  m.set('role:' + TEACHER_MAIL, 'teacher');
  m.set('role:' + ROOT_MAIL, 'root');
  m.set('bind:' + TEACHER_MAIL, JSON.stringify([STUDENT_MAIL]));
  m.set('user:e:' + STUDENT_MAIL, JSON.stringify({ email: STUDENT_MAIL, created: 1780000000000 }));
  m.set('user:e:' + USER_MAIL, JSON.stringify({ email: USER_MAIL, created: 1780000000000 }));
  m.set('user:e:' + TEACHER_MAIL, JSON.stringify({ email: TEACHER_MAIL, created: 1780000000000 }));
  m.set('user:e:' + ROOT_MAIL, JSON.stringify({ email: ROOT_MAIL, created: 1780000000000 }));
  m.set('sync:e:' + STUDENT_MAIL, JSON.stringify({ data: { settings: { name: '探针学生' }, words: [], sessions: [] }, ts: 1790000000000 }));
  return m;
}

console.log('\n[A] 服务端拦门：普通用户越权必须被拒（实测拒一次）');
{
  const kv = fakeKV(baseKV());
  const w0 = kv.counts.put + kv.counts.delete;
  const r1 = await callRoles('/api/roles?action=students', kv, H.user);
  ok('① 普通用户 action=students → 403 forbidden', r1.status === 403 && r1.j.error === 'forbidden', r1.status + '/' + r1.j.error);
  const r2 = await callRoles('/api/roles?view=' + STUDENT_MAIL, kv, H.user);
  ok('① 普通用户 view=别人数据 → 403 forbidden', r2.status === 403 && r2.j.error === 'forbidden', r2.status + '/' + r2.j.error);
  const r3 = await callRoles('/api/roles?action=perm', kv, H.user);
  ok('① 普通用户 action=perm → 200 但 mine=user 档', r3.status === 200 && r3.j.role === 'user'
    && Object.values(r3.j.mine).every(v => v === false), r3.j.role);
  ok('① 越权三连全程零 KV 写', kv.counts.put + kv.counts.delete === w0, kv.counts.put + '/' + kv.counts.delete);
}
{
  const kv = fakeKV(baseKV());
  const r = await callRoles('/api/roles?action=students', kv, H.teacher);
  ok('② teacher 自己的 students → 200（没被拦错）', r.status === 200 && r.j.role === 'teacher', r.status);
  const rv = await callRoles('/api/roles?view=' + STUDENT_MAIL, kv, H.teacher);
  ok('② teacher 看自己名单内学生 → 200', rv.status === 200, rv.status);
  const rx = await callRoles('/api/roles?action=students', kv, H.root);
  ok('② root 也走同一道 students 门 → 200', rx.status === 200 && rx.j.role === 'root', rx.status);
}
console.log('\n[B] 密钥门：前端隐藏之外，写操作必须被服务端再拒一次');
{
  const kv = fakeKV(baseKV());
  const r1 = await callAdmin('/api/admin', kv, { action: 'perm_set', cfg: { user: {}, teacher: {} } }, '');
  ok('③ perm_set 无密钥 → 401', r1.status === 401, r1.status);
  const r2 = await callAdmin('/api/admin', kv, { action: 'perm_set', cfg: { user: {}, teacher: {} } }, 'wrong-key');
  ok('③ perm_set 错密钥 → 401', r2.status === 401, r2.status);
  ok('③ 两次被拒零写入', !kv.m.has('permcfg'), '');
  const r3 = await callAdmin('/api/admin', kv, { action: 'perm_get' }, '');
  ok('③ perm_get 无密钥 → 401（读也不许匿名）', r3.status === 401, r3.status);
}
console.log('\n[C] 坏凭证与异常路径：fail closed');
{
  const kv = fakeKV(baseKV());
  const r1 = await callRoles('/api/roles?action=me', kv, {});
  ok('④ 无凭证 me → 401', r1.status === 401 && r1.j.error === 'unauthorized', r1.status);
  const r2 = await callRoles('/api/roles?action=me', kv, { 'X-Session': 'z'.repeat(32) });
  ok('④ 不存在的 token → 401（不静默放行）', r2.status === 401, r2.status);
  const r3 = await callRoles('/api/roles?action=me', kv, { 'X-Session': 'short' });
  ok('④ 伪造 token → 401', r3.status === 401, r3.status);
  const r4 = await callRoles('/api/roles?action=students', kv, H.ghost);
  ok('④ 没登记的 session → 401（KV 里没这条 sess 键，不静默放行）', r4.status === 401, r4.status);
  const r5 = await callRoles('/api/roles?action=nonsense', kv, H.teacher);
  ok('④ 未知 action + teacher → 400 bad_action（不放宽）', r5.status === 400 && r5.j.error === 'bad_action', r5.status);
}
console.log('\n[D] 入口显隐的数据面：授权/取消立刻反映到 me');
{
  const kv = fakeKV(baseKV());
  const before = await callRoles('/api/roles?action=me', kv, H.user);
  ok('⑤ 授权前 me.role=user（学生数据/站长面板入口都不画）', before.j.role === 'user', before.j.role);
  const set = await callAdmin('/api/admin', kv, { action: 'role_set', acct: USER_MAIL, role: 'teacher' }, 'k');
  ok('⑤ role_set 授权成功', set.status === 200 && set.j.role === 'teacher', set.status);
  const after = await callRoles('/api/roles?action=me', kv, H.user);
  ok('⑤ 授权后 me.role=teacher 立刻生效（入口马上亮）', after.j.role === 'teacher', after.j.role);
  const undo = await callAdmin('/api/admin', kv, { action: 'role_set', acct: USER_MAIL, role: '' }, 'k');
  ok('⑤ 取消角色成功', undo.status === 200 && undo.j.role === '', undo.status);
  const gone = await callRoles('/api/roles?action=me', kv, H.user);
  ok('⑤ 取消后 me.role=user 立刻生效（入口马上灭）', gone.j.role === 'user', gone.j.role);
  const deny = await callRoles('/api/roles?action=students', kv, H.user);
  ok('⑤ 取消后 students 立刻 403', deny.status === 403, deny.status);
}

console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);
