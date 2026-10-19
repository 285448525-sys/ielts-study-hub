/* 遮挡判据自检（10/19）：用受控 HTML 夹具验证，不依赖真实站点。
   场景 A（净空 120px）必须 0 条；场景 B（净空 0）必须 ≥1 条。
   场景 C（净空 120px + 收起的 <details> 里塞一块超高文本）必须 0 条
     —— 10/19 第七修回归闸：收起的 details 正文在 Chrome 里「有盒子但不渲染」，
        getComputedStyle().display 仍是 block、getClientRects() 仍有 1 个矩形，
        只有 checkVisibility() 会返回 false。旧筛选用前者 → 把这块看不见的文本
        当成「正文末端」→ errorbook 页报了「底部死区 107px」假问题（实测真站已证伪：
        展开 details 后死区立刻回到 -24px，截图也确认卡片与按钮全在底栏之上）。
   这是「审计工具必须有自检」铁律的落地：没有自检的判据 = 摆设。
   跑法：node tests/_selftest_occlusion.cjs */
const fs = require('fs');
const path = require('path');
const os = require('os');
let chromium = null;
for (const p of [
  'C:/Users/Camille/.dsh/profiles/desktop/node_modules/playwright-core',
  'C:/Users/Camille/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
  'playwright-core',
]) { try { chromium = require(p).chromium; break; } catch (e) {} }
if (!chromium) { console.log('NO_PLAYWRIGHT'); process.exit(3); }

/* 复用探针里的 visualChecks（保证自检测的是同一套逻辑，不是另一份抄的） */
let src = fs.readFileSync(path.join(__dirname, '_audit_deep.cjs'), 'utf8');
const s = src.indexOf('const visualChecks = async () => {');
const e = src.indexOf('const NOISE =', s);
if (s < 0 || e < 0) { console.log('EXTRACT_FAIL'); process.exit(1); }
const fnSrc = src.slice(s, e).trim();

const HTML = (paddingBottom, withClosedDetails) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
html,body{margin:0;padding:0}body{overflow-y:hidden}
main.container{height:844px;overflow-y:auto;padding-bottom:${paddingBottom}px;box-sizing:border-box}
section.card{height:400px;background:#eee;margin:10px;padding:10px}
p.muted{margin:10px}
.float-bar{position:fixed;left:0;bottom:0;width:390px;height:80px;background:#333;z-index:8000}
</style></head><body>
<main class="container">
  <section class="card" id="c1"><h2>标题一</h2><p class="muted">第一段内容</p></section>
  <section class="card" id="c2"><h2>标题二</h2><p class="muted">第二段内容</p></section>
  <section class="card" id="c3"><h2>标题三</h2><p class="muted">第三段内容</p></section>
  <section class="card" id="c4"><h2>标题四</h2><p class="muted">第四段内容</p></section>
  <section class="card" id="c5"><h2>标题五</h2><p class="muted">最后一块内容</p>${withClosedDetails
    ? `<details><summary>展开看：题干 / 翻译 / 逐词对照 / 原文</summary><p style="height:600px">这段在收起的 details 里，用户此刻看不见，不该参与「正文末端」判定。</p></details>`
    : ''}<a href="#">一个链接</a><button>按钮</button></section>
</main>
<div class="float-bar" id="floatTimer"></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const run = async (name, html) => {
    const f = path.join(require('os').tmpdir(), 'fixture_' + name + '.html');
    fs.writeFileSync(f, html, 'utf8');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.goto('file://' + f, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    /* ⚠️ 场景 C 的必要一步：**Chrome 对收起 `<details>` 的正文是「懒布局」——
       不去碰它，getBoundingClientRect() 恒为 0×0 宽高 0（会被尺寸判据直接筛掉，
       夹具就永远复现不出真站那个误报）；一旦对它做过样式/布局读取，盒子才出现
       （真站上页面自身的渲染早就把它触发了）。这里显式触发，让夹具与真站同态。 */
    await page.evaluate(() => {
      document.querySelectorAll('details:not([open]) > *:not(summary)').forEach(el => {
        getComputedStyle(el).display; el.getBoundingClientRect();
      });
    });
    const r = await page.evaluate(eval('(' + fnSrc.replace(/^const visualChecks = /, '').replace(/;$/, '') + ')'));
    await page.close();
    return r;
  };

  /* A：净空 120px（浮条 80px + 40 呼吸）→ 应 0 条 */
  const a = await run('ok', HTML(120));
  console.log('【A 净空120】遮挡 =', a.occluded.length, '条；deadDepth =', a.deadDepth, '；deadEl =', a.deadEl, '；lastBottom =', a.lastBottom, '；overlayTop =', a.overlayTop);
  a.occluded.forEach(o => console.log('    ⚠️ ' + o.what + ' — ' + (o.note || '')));

  /* B：净空 0 → 最后一块被吃，应 ≥1 条 */
  const b = await run('bad', HTML(0));
  console.log('【B 净空0】遮挡 =', b.occluded.length, '条；deadDepth =', b.deadDepth, '；deadEl =', b.deadEl, '；lastBottom =', b.lastBottom, '；overlayTop =', b.overlayTop);
  b.occluded.forEach(o => console.log('    ⚠️ ' + o.what + ' — ' + (o.note || '')));

  const okA = a.occluded.length === 0;
  const okB = b.occluded.length >= 1;

  /* C：净空 120px（与 A 同）+ 收起 details 里一块 600px 超高的不可见文本
        → 旧判据会把它当「正文末端」报假问题；正确判据必须 0 条、deadDepth 仍为负 */
  const c = await run('closeddetails', HTML(120, true));
  console.log('【C 收起details】遮挡 =', c.occluded.length, '条；deadDepth =', c.deadDepth, '；deadEl =', c.deadEl, '；lastBottom =', c.lastBottom, '；overlayTop =', c.overlayTop);
  c.occluded.forEach(o => console.log('    ⚠️ ' + o.what + ' — ' + (o.note || '')));
  const okC = c.occluded.length === 0 && !(typeof c.deadDepth === 'number' && c.deadDepth > 40);

  console.log('\n自检：正常页不误报 = ' + (okA ? '✓' : '✗') + ' ；遮挡页能抓到 = ' + (okB ? '✓' : '✗') + ' ；收起 details 不算正文末端 = ' + (okC ? '✓' : '✗'));
  await browser.close();
  process.exit(okA && okB && okC ? 0 : 1);
})().catch(e => { console.log('FATAL ' + String(e && e.message).split('\n')[0]); process.exit(1); });

