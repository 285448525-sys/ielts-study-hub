/* 换「共享外壳整组」的版本号 + 顺手 +1 缓存版本
   用法：node scripts/bump-assets.cjs 20261020a        （省略参数 = 干跑，只报告会改什么）
        node scripts/bump-assets.cjs 20261020a --no-sw  （只换页面版本号，不动 sw.js 的 CACHE）

   为什么需要它：共享外壳已按功能拆成 7 块（js/common.js + 6 块 js/common-*.js），
   任何**一块**改了都要求 20 个页面里这一组 <script> 的 ?v= **整组一起换**，
   且 sw.js 的 CACHE 版本 +1。手工改 20 页 × 7 个标签极易漏 → 漏了就复现历史事故
   （「改了没生效，硬刷新才好」/「本地好线上坏」）。一条命令替代手工。

   只改 `?v=` 值与 sw.js 的 CACHE 串，不动任何别的行；改完打印每页结果。 */
const fs = require('fs'), p = require('path');
const R = p.resolve(__dirname, '..');
const STAMP = (process.argv[2] || '').trim();
const NO_SW = process.argv.includes('--no-sw');
if (!/^[0-9a-z]{6,}$/.test(STAMP)) {
  console.log('用法：node scripts/bump-assets.cjs <新版本号>  例：20261020a');
  const cur = fs.readFileSync(p.join(R, 'js', 'common.js'), 'utf8');
  console.log('（这是干跑：未改任何文件。当前 common.js 首行：' + (fs.readFileSync(p.join(R, 'js', 'common.js'), 'utf8').split('\n')[0] || '').slice(0, 60) + '）');
  process.exit(0);
}
const CHUNKS = ['js/common.js', 'js/common-ai.js', 'js/common-sync.js', 'js/common-merge.js',
                'js/common-cloud.js', 'js/common-shell.js', 'js/common-pwa.js'];
const TAG = /(<script defer src=")(js\/common(?:-[a-z]+)?\.js)\?v=[0-9a-z]+("><\/script>)/g;

const htmls = fs.readdirSync(R).filter(f => f.endsWith('.html')).sort();
let pages = 0, tags = 0;
for (const f of htmls) {
  const full = p.join(R, f);
  const s = fs.readFileSync(full, 'utf8');
  let n = 0;
  const next = s.replace(TAG, (m, a, base, c) => { n++; return a + base + '?v=' + STAMP + c; });
  if (n) { fs.writeFileSync(full, next, 'utf8'); pages++; tags += n; }
}
console.log('页面版本号：改 ' + pages + ' 个页面 / ' + tags + ' 个标签 → ?v=' + STAMP);

if (!NO_SW) {
  const swf = p.join(R, 'sw.js');
  const sw = fs.readFileSync(swf, 'utf8');
  const m = sw.match(/const CACHE = 'ielts-hub-v(\d+)'/);
  if (!m) { console.log('⚠️ sw.js 里没找到 CACHE 版本串，请人工确认'); }
  else {
    const nv = Number(m[1]) + 1;
    fs.writeFileSync(swf, sw.replace(m[0], "const CACHE = 'ielts-hub-v" + nv + "'"), 'utf8');
    console.log('sw.js 缓存版本：v' + m[1] + ' → v' + nv);
  }
}
console.log('提醒：接着跑相关回归探针（见 MODULES.md §4），再 commit + push。');