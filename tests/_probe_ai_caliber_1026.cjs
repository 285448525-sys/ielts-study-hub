/* AIQ-1 AI 额度口径闸（长期资产，已登记进 tests/_regress_1017.cjs）
   —— 纯静态读源码，不碰线上、不花钱、不占 IP 额度。
   为什么单独写：`_probe_ai_quota_1005` 全篇打线上真接口（花 DeepSeek 钱 + 吃本机 IP 日额度 200 次，
   而她和我在同一 IP → 跑一次她当天就用不了，10/6 烧穿过）。施工书也写「只许 GET、任何会触发
   生成的路径一律拦掉」→ 那支按设计不进基线，另立这支零消耗的。
   验什么（都对着 functions/api/ai.js 与 auth.js 的真实源码文本断言）：
     ① 四段计数键名与默认额度口径在位
     ② 只对成功 2xx 计数（失败不扣）
     ③ 计数必须在同一条 await 链上（waitUntil 会绕过闸门 = 10/5 P0 病根）
     ④ 统计键已合并成 aistat:<YYYYMMDD>（省 KV 写量）
     ⑤ aiqwv 已下线（全仓无读方，写它纯浪费）
   跑法：node tests/_probe_ai_caliber_1026.cjs */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const AI = fs.readFileSync(path.join(ROOT, 'functions/api/ai.js'), 'utf8');
const AUTH = fs.readFileSync(path.join(ROOT, 'functions/api/auth.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

console.log('\n① 额度口径（默认值必须与产品口径同源）');
ok('ai.js 有 mock 组键（aiqmo）', /aiqmo:/.test(AI));
ok('ai.js 有 weekly 组键（aiqw）', /aiqw:/.test(AI));
ok('ai.js 有分钟风控键（aiqm:）', /aiqm:/.test(AI));
ok('ai.js 有 IP 闸键（aiqip:）', /aiqip:/.test(AI));
ok('口语模考月额度 = 1 次/月（读侧口径在位）', /免费每月\s*1\s*次|aiqmo:'\s*\+\s*acct/.test(AI));
ok('周额度默认 5（AI_USER_WEEKLY_LIMIT）', /AI_USER_WEEKLY_LIMIT[\s\S]{0,80}'5'/.test(AI));
ok('IP 闸默认 1000', /AI_IP_LIMIT[\s\S]{0,60}'1000'/.test(AI));
ok('auth.js 的 ai_usage 返回 mock/weekly 两组', /mock/.test(AUTH) && /weekly/.test(AUTH));

console.log('\n② 只对成功 2xx 计数（失败不扣额度）');
ok('upstream 失败时提前 return（不进入计数段）', /if\s*\(\s*!upstream\.ok\s*\)/.test(AI));

console.log('\n③ 计数必须在同一条 await 链上（waitUntil 会绕过闸门 = 10/5 P0 病根）');
const AI_CODE = AI
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
ok('真实代码里没有 waitUntil( 调用（注释里提到不算）',
  !/ctx\.waitUntil\(|context\.waitUntil\(/.test(AI_CODE),
  (AI_CODE.match(/.*waitUntil.*/g) || []).slice(0, 2).join(' | '));
ok('计数走 await（存在 await 与计数键同一段）', /await[\s\S]{0,200}(aiqmo|aiqw|aiqm|aiqip|aistat)/.test(AI));
ok('多键写入塞 jobs 后一次 Promise.all', /const jobs\s*=\s*\[/.test(AI) && /Promise\.all\(jobs\)/.test(AI));

console.log('\n④ 统计键已合并（省 KV 写量）');
ok('存在 aistat:<日期> 合并键', /aistat:/.test(AI));
ok('aistat 里带 model 与缓存命中字段', /prompt_cache_hit_tokens|cache_hit|model/.test(AI));

console.log('\n⑤ aiqwv 已下线');
ok('ai.js 不再写 aiqwv:<acct>', !/aiqwv:'\s*\+\s*acct/.test(AI));

console.log('\n' + '='.repeat(50));
console.log('结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
