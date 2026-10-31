/* 预缓存名单完整性：口语页拆出来的每一块都必须在 PRECORE 里。
   为什么需要这支：T-009 拆了 8 个文件，其中 S-2 与 S-6 两批都漏登记 —— 都表现为
   「线上页面能开、但弱网/离线下某一块 undefined，功能静默缺失」，不报错所以没人发现。
   判据：读 speaking.html 里所有 js/sp-*.js（去掉 ?v=），逐个查 sw.js 的 PRECORE 数组。
   附带：登记了但文件不存在的也要报（防重构后留下死条目）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

const html = fs.readFileSync(path.join(ROOT, 'speaking.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* speaking.html 里实际加载的 sp-*.js（按声明顺序） */
const used = [...html.matchAll(/src="(js\/sp-[a-z0-9-]+\.js)(?:\?v=[0-9a-z]+)?"/g)].map(m => '/' + m[1]);
console.log('speaking.html 加载 ' + used.length + ' 块：' + used.join(' · '));

/* PRECORE 数组内容（只取数组字面量那一段，避免把注释里的示例当条目） */
const precoreStart = sw.indexOf('const PRECORE = [');
const precoreEnd = sw.indexOf('];', precoreStart);
const precoreSrc = sw.slice(precoreStart, precoreEnd);
const precore = [...precoreSrc.matchAll(/'(\/[^']+)'/g)].map(m => m[1]);
console.log('PRECORE 共 ' + precore.length + ' 条');

/* ① 每一块都要在 PRECORE 里 */
for (const f of used) {
  ok('① ' + f + ' 已登记进预缓存', precore.includes(f), { inPrecore: precore.includes(f) });
}

/* ② PRECORE 里登记了、但仓库里真没有的文件（防死条目）；跳过外部/动态路径 */
const dynamicSkip = /^(https?:)|\.(png|jpg|svg|ico|webmanifest|mp3)$/;
for (const f of precore) {
  if (dynamicSkip.test(f)) continue;
  const fp = path.join(ROOT, f.replace(/^\//, ''));
  ok('② ' + f + ' 文件真实存在', fs.existsSync(fp), { exists: fs.existsSync(fp) });
}

/* ③ 拆出来的块里不许用顶层 const/let（window.eval 跨文件不可见的铁律） */
for (const f of used) {
  const fp = path.join(ROOT, f.replace(/^\//, ''));
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, 'utf8');
  /* 只看行首顶层（不缩进的）声明 */
  const bad = src.split('\n')
    .map((l, i) => ({ l, i }))
    .filter(x => /^(const|let)\s+\w/.test(x.l))
    .map(x => (x.i + 1) + ': ' + x.l.trim().slice(0, 60));
  ok('③ ' + f + ' 无顶层 const/let（跨文件可见性铁律）', bad.length === 0, bad.slice(0, 3));
}

console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
process.exit(fail ? 1 : 0);
