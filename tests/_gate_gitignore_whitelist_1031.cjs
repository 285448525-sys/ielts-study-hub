/* TESTS-GITIGNORE-1 校验闸（10-31）
   为什么需要这支：10-31 之前 .gitignore 里 `/tests/*` 只放行 3 个文件，而 _regress_1017.cjs
   的白名单有 60 支 —— 其余全被静默挡住，只活在一个人本地。症状有两个，都很贵：
     ① 谁 clone 出来都跑不了一遍回归；
     ② 「以为入库了其实没进」—— _probe_coachav_1020 被 git add 静默忽略过（10-30 我自己踩到）。
   这支闸把「白名单」与「放行清单」钉成同一份事实：两边不一致就红，别等下一个窗口再踩。

   判据（三条全过才算绿）：
   ① _regress_1017.cjs 里列出的每一支 .cjs 都**没被** .gitignore 忽略
   ② .gitignore 里放行的每一支 .cjs 都在白名单里（防「放行了一堆然后忘了登记」）
   ③ 白名单里被 require 的本地辅助文件也没被忽略

   用法：node tests/_gate_gitignore_whitelist_1031.cjs（不需要起服务器） */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); }
};

const regress = fs.readFileSync(path.join(ROOT, 'tests/_regress_1017.cjs'), 'utf8');
const white = Array.from(new Set(
  (regress.match(/'(_[a-z0-9_]+\.cjs)'/g) || []).map(m => m.replace(/'/g, ''))
)).sort();

console.log('白名单 ' + white.length + ' 支');

/* ① 白名单里每一支都不能被 .gitignore 忽略 */
const ignored = [];
for (const f of white) {
  try {
    execSync('git check-ignore -q "tests/' + f + '"', { cwd: ROOT, stdio: 'ignore' });
    ignored.push(f);   // 命令成功 = 被忽略 = 有问题
  } catch (e) { /* 非零退出 = 未被忽略 = 正确 */ }
}
ok('① 白名单探针全部没被 .gitignore 挡住', ignored.length === 0, ignored.slice(0, 10));

/* ② .gitignore 放行的每一支都在白名单里 */
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const allowed = (gi.match(/^!\/tests\/(_[a-z0-9_]+\.cjs)\s*$/gm) || [])
  .map(l => l.replace(/^!\/tests\//, '').trim());
const allowedSet = new Set(allowed);
const whiteSet = new Set(white);

/* _anc_seed / _review_util 是夹具，不是回归探针本身；_with_server / _static_server 是基建。
   这四类允许只放行不登记。 */
const FIXTURE = new Set(['_anc_seed.cjs', '_review_util.cjs', '_with_server.cjs', '_static_server.cjs',
  '_gate_gitignore_whitelist_1031.cjs', '_regress_1017.cjs']);   // _regress 就是白名单本身，不自引用
const extra = allowed.filter(f => !whiteSet.has(f) && !FIXTURE.has(f));
ok('② .gitignore 放行清单没有「放行了但没登记」的孤儿', extra.length === 0, extra.slice(0, 10));

/* ③ 白名单探针 require 的本地文件也必须放行 */
const reqs = new Set();
for (const f of white) {
  const fp = path.join(ROOT, 'tests', f);
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, 'utf8');
  for (const m of src.matchAll(/require\(\s*'\.\/([A-Za-z0-9_\-]+\.c?js)'\s*\)/g)) reqs.add(m[1]);
}
const missing = [];
for (const r of reqs) {
  /* 仓库根 js/ 下的运行时文件不在 tests 目录，跳过；只查 tests 内的夹具 */
  if (!fs.existsSync(path.join(ROOT, 'tests', r))) { missing.push(r + '(不存在)'); continue; }
  try {
    execSync('git check-ignore -q "tests/' + r + '"', { cwd: ROOT, stdio: 'ignore' });
    missing.push(r);
  } catch (e) { /* 未忽略 = 正确 */ }
}
ok('③ 白名单探针 require 的夹具也被放行', missing.length === 0, missing);

/* ④ 顺带查：已跟踪的 tests/ 文件里有没有「不在这两份清单里」的野文件 */
const tracked = execSync('git ls-files tests/', { cwd: ROOT }).toString().split('\n').filter(Boolean)
  .map(p => p.replace(/^tests\//, ''));
const strays = tracked.filter(f => !whiteSet.has(f) && !allowedSet.has(f) && !FIXTURE.has(f));
console.log('  · 已跟踪 tests/ 文件 ' + tracked.length + ' 个，其中清单外 ' + strays.length + ' 个');
if (strays.length) console.log('    ' + strays.join(' · '));

console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
process.exit(fail ? 1 : 0);
