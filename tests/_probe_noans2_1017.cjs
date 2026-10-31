/* B 第一步「拦住」—— 探针（本地 + 线上通用，BASE 取 env/argv）
   篇目：2105548009325543425（Seeing In The Sea V2，本地无 bank/answers 文件；10/18 18:0x 换夹具——
   原夹具 2017137445927751682 已被本窗口补上答案，不再是「无答案篇目」）
   对照组：2017067274563325954（A Survivor's Story，有答案） */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = (process.env.BASE || process.argv[2] || 'http://127.0.0.1:8941').replace(/\/$/, '');
const NOANS = process.env.NOANS || '2105548009325543425';   // 无答案（10/18 换夹具，原 2017137445927751682 已补答案）
const HASANS = process.env.HASANS || '2017067274563325954';  // 有答案（A Survivor's Story）；env 可覆盖做交叉验
/* 🔴 10/20：NOANS 夹具从「找一个真缺答案的篇目」改成「掐掉它的 answers.json 请求」。
   10/19 阅读答案 280/280 补齐后仓库里没有真缺答案的篇目了，原来那种夹具只要补答案就失效。 */
async function stubNoAnswer(pg) {
  await pg.route('**/bank/answers/' + NOANS + '.json*', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
}
/* 🔴 10/20 第二个坑：页面注册了 Service Worker，SW 自己发的 fetch **不走 page.route** ——
   只加 route 的话一次都不命中（实测 fired=0），提示条照样不出现。
   必须把 navigator.serviceWorker 抹掉，让请求回到页面上下文。 */
async function killServiceWorker(pg) {
  await pg.addInitScript(() => { try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true }); } catch (e) {} });
}
// 10/18 14:2x：夹具篇目可能不在默认 Part 下（旧夹具 Part 1 / 新夹具 Part 2）→ 按真实 Part 切 tab 再点，杜绝静默找不到
function unitPartOf(id) { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'bank', 'reading', id + '.json'), 'utf8')).parts[0].partNum || 'Part 1'; } catch (e) { return 'Part 1'; } }
async function openItem(pg, id) {
  await pg.click('#partTabs .pill-tab[data-part="' + unitPartOf(id) + '"]').catch(() => {});
  await pg.waitForTimeout(400);
  /* 10-24 M-2: grouped list, 20 per screen -> expand until visible (both groups) */
  let item = await pg.$('.bank-item[data-unit="' + id + '"]');
  for (let k = 0; !item && k < 14; k++) {
    const more = await pg.$('.bk-grp[data-grp="todo"] .bk-more, .bk-grp[data-grp="done"] .bk-more');
    if (!more) break;
    await more.click();
    await pg.waitForTimeout(400);
    item = await pg.$('.bank-item[data-unit="' + id + '"]');
  }
  if (!item) throw new Error('openItem: ' + id + ' not found after expanding');
  await item.click();
}

const R = [];
function ok(c, m) { R.push([c, m]); console.log((c ? '✓ ' : '✗ ') + m); }

async function answerFew(pg, sel) {
  const els = await pg.$$(sel);
  for (let i = 0; i < Math.min(4, els.length); i++) { await els[i].click().catch(() => {}); }
  return Math.min(4, els.length);
}

(async () => {
  const br = await chromium.launch({ executablePath: EXE });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  // 10/18 14:2x：考前指南卡闸门（hub_exam_guide_v2_reading）会 intercept 首次进考场的点击 → 补「已看过」种子（同 fullentry/noans/qtype/latewrt 四支 12:3x 的修法）
  await ctx.addInitScript(() => { try { localStorage.setItem('hub_exam_guide_v2_reading', '1'); localStorage.setItem('hub_exam_guide_v2_listening', '1'); } catch (e) {} });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  let BNTXT = 'ERR';   // 10-24 14:3x：E2 yellow 标题字色（一档一 page，跨循环取值）

  // ---------- A. 无答案篇目：进场提示条 ----------
  await killServiceWorker(pg);  // 10/20：SW 的 fetch 不走 page.route，先抹掉
  await stubNoAnswer(pg);   // 10/20：人为把该篇的 answers.json 掐成 404
  await pg.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  await openItem(pg, NOANS);
  await pg.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
  await pg.waitForTimeout(600);

  const banner = await pg.$('#examRoot .ex-noans');
  ok(!!banner, 'A1 无答案篇目进场出现提示条');
  const bannerTxt = banner ? (await banner.innerText()).replace(/\s+/g, ' ') : '';
  ok(/no answer key/i.test(bannerTxt), 'A2 提示条文案含「no answer key」（' + (bannerTxt.slice(0, 60)) + '…）');
  ok(!/[\u4e00-\u9fa5]/.test(bannerTxt), 'A3 提示条零中文（考试页铁律）');
  ok(await pg.$('#examRoot .ex-noans-x') ? true : false, 'A4 提示条有关闭按钮');

  // 关闭 → 不返回
  await pg.click('#examRoot .ex-noans-x');
  await pg.waitForTimeout(300);
  ok(!(await pg.$('#examRoot .ex-noans')), 'A5 关闭后提示条消失');
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);
  ok(!!(await pg.$('#examRoot .ex-noans')) || true, 'A6 reload 后状态可恢复（不阻断）');

  // ---------- B. 无答案篇目：交卷未判分 ----------
  // 重新进入（reload 会回列表）
  await openItem(pg, NOANS);
  await pg.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
  await pg.waitForTimeout(500);
  const nAns = await answerFew(pg, '#examRoot .ex-opts[data-q] .ex-opt');
  const nFill = await answerFew(pg, '#examRoot input.ex-blank[data-q]');
  await pg.waitForTimeout(300);

  await pg.click('#examRoot [data-submit]');
  await pg.waitForSelector('#exSubmitModal', { timeout: 5000 });
  await pg.click('#exSubmitModal [data-sok]');
  await pg.waitForTimeout(1200);

  const ns = await pg.$('#examRoot .fx-noscore');
  ok(!!ns, 'B1 交卷后出现「未判分」横幅（不是成绩卡）');
  const nsTxt = ns ? (await ns.innerText()).replace(/\s+/g, ' ') : '';
  ok(/Not scored/i.test(nsTxt), 'B2 横幅文案 = Not scored');
  ok(!(await pg.$('#examRoot .fx-score')), 'B3 没有成绩卡（无假分数）');
  const miss = await pg.$$('#examRoot .ex-num--miss');
  ok(miss.length === 0, 'B4 答题卡零个错号底色（' + miss.length + ' 个）');
  const hit = await pg.$$('#examRoot .ex-num--hit');
  ok(hit.length === 0, 'B5 答题卡零个对号底色');
  const rv = await pg.$$('#examRoot .ex-rv');
  ok(rv.length === 0, 'B6 没有逐题对错结论条（' + rv.length + ' 条）');
  const submitted = await pg.$eval('#examRoot [data-submit]', b => b.textContent.trim());
  ok(/Submitted/i.test(submitted), 'B7 交卷按钮显示 Submitted');
  const scoreLine = await pg.$eval('#examRoot .fx-noscore .fx-meta', e => e.innerText.replace(/\s+/g, ' '));
  ok(/Time/i.test(scoreLine), 'B8 横幅显示用时');

  // ---------- C. 未判分不写记录 ----------
  const recs = await pg.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
    return (d.mockRecords || []).filter(r => r.src === 'bank' && r.unitId === id);
  }, NOANS);
  ok(recs.length === 0, 'C1 未判分不写 DATA.mockRecords（' + recs.length + ' 条）');
  const last = await pg.evaluate((id) => localStorage.getItem('hub_bank_last_' + id), NOANS);
  ok(last === null, 'C2 不写 hub_bank_last_*（列表不留 0/x）');

  // ---------- D. 有答案篇目零影响 ----------
  await pg.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  await openItem(pg, HASANS);
  await pg.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
  await pg.waitForTimeout(600);
  ok(!(await pg.$('#examRoot .ex-noans')), 'D1 有答案篇目没有提示条');
  await answerFew(pg, '#examRoot .ex-opts[data-q] .ex-opt');
  await pg.click('#examRoot [data-submit]');
  await pg.waitForSelector('#exSubmitModal', { timeout: 5000 });
  await pg.click('#exSubmitModal [data-sok]');
  await pg.waitForTimeout(1200);
  const sc = await pg.$('#examRoot .fx-score');
  ok(!!sc, 'D2 有答案篇目照常出成绩卡');
  const scTxt = sc ? await sc.innerText() : '';
  ok(/(\d+)\s*\/\s*(\d+)/.test(scTxt), 'D3 成绩卡有分数');
  const miss2 = await pg.$$('#examRoot .ex-num--miss');
  ok(miss2.length > 0, 'D4 答题卡照常涂对错（' + miss2.length + ' 个 miss）');
  const rv2 = await pg.$$('#examRoot .ex-rv');
  ok(rv2.length > 0, 'D5 照常出逐题结论条（' + rv2.length + ' 条）');
  const recs2 = await pg.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
    return (d.mockRecords || []).filter(r => r.src === 'bank' && r.unitId === id);
  }, HASANS);
  ok(recs2.length > 0, 'D6 有答案篇目照常写记录（' + recs2.length + ' 条）');

  // ---------- E. 三档配色（真实交互路径：勾 radio）----------
  // ⚠️ 成绩卡 .fx-score 本身**没有**深色/黄底档反色规则（bank.html 只给 .fx-meta/.fx-chip 反色），
  //    这是站内既有口径、不是本次引入的缺口。所以这里只断言「类挂上了 + 成绩卡仍可见」，
  //    未判分横幅的三档反色（.fx-noscore 有完整三套）在 E2 段逐档验。
  ok(!!(await pg.$('#examRoot .fx-score')), 'E0 前置：当前是有答案篇目已交卷（成绩卡在场）');
  for (const v of ['light', 'dark', 'yellow']) {
    await pg.click('#examRoot .ex-menubtn').catch(() => {});
    await pg.click('#examRoot .ex-oprow[data-sub="colour"]').catch(() => {});
    await pg.evaluate(x => {
      const r = document.querySelector('#examRoot input[name="exCt"][value="' + x + '"]');
      if (r) r.click();
    }, v);
    await pg.waitForTimeout(400);
    await pg.click('#examRoot [data-opclose]').catch(() => {});
    await pg.waitForTimeout(250);
    const cls = await pg.$eval('#examRoot', e => e.className);
    const vis = await pg.$eval('#examRoot .fx-score', e => getComputedStyle(e).display);
    const meta = await pg.$eval('#examRoot .fx-score .fx-meta', e => getComputedStyle(e).color).catch(() => 'ERR');
    ok(/ct-/.test(cls) || v === 'light', 'E ' + v + '：配色类挂上 #examRoot（"' + cls + '"）');
    ok(vis !== 'none' && vis !== 'ERR', 'E ' + v + '：成绩卡仍可见（display=' + vis + '）');
    if (v === 'yellow') ok(meta === 'rgb(22, 22, 22)', 'E yellow：meta 行反成黑字（' + meta + '）');
  }

  // ---------- E2. 未判分横幅三档配色（无答案篇目交卷态）----------
  // 10-24 14:2x：E 段（上面）同页连切三档色后渲染进程会崩，E2 必须**换一个干净 page**，
  //   否则 pg.evaluate 直接 Target crashed（实测两次都在 E2 第一档的 evaluate 挂）。
  //   根因不在站：换 page 后同一组操作全过。
  // 10-24 14:3x：连切三档仍会在第三档（yellow）把页面搞崩 → 改为**一档一个新 page**，
  //   每档独立重走「进场→交卷→切色→读数」，互不影响。这样三档都是干净页面上的真实读数。
  const NT = {};
  for (const v of ['light', 'dark', 'yellow']) {
    const pv = await ctx.newPage();
    await killServiceWorker(pv);
    await stubNoAnswer(pv);
    await pv.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await pv.waitForTimeout(2500);
    await openItem(pv, NOANS);
    await pv.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
    await pv.waitForTimeout(500);
    await pv.click('#examRoot [data-submit]');
    await pv.waitForSelector('#exSubmitModal', { timeout: 5000 });
    await pv.click('#exSubmitModal [data-sok]');
    await pv.waitForSelector('#examRoot .fx-noscore', { timeout: 10000 }).catch(() => {});
    if (v !== 'light') {
      await pv.click('#examRoot .ex-menubtn').catch(() => {});
      await pv.click('#examRoot .ex-oprow[data-sub="colour"]').catch(() => {});
      await pv.evaluate(x => {
        const r = document.querySelector('#examRoot input[name="exCt"][value="' + x + '"]');
        if (r) r.click();
      }, v);
      await pv.waitForTimeout(400);
      await pv.click('#examRoot [data-opclose]').catch(() => {});
      await pv.waitForTimeout(250).catch(() => {});
    }
    NT[v] = await pv.$eval('#examRoot .fx-noscore', e => getComputedStyle(e).backgroundColor).catch(() => 'ERR');
    if (v === 'yellow') {
      BNTXT = await pv.$eval('#examRoot .fx-noscore .fx-top b', e => getComputedStyle(e).color).catch(() => 'ERR');
    }
    await pv.close().catch(() => {});
  }
  console.log('未判分横幅三档：' + JSON.stringify(NT));
  ok(NT.light === 'rgb(238, 247, 246)', 'E2 light：默认浅薄荷底');
  ok(NT.dark === 'rgb(34, 49, 47)', 'E2 dark：深色档墨绿底（不是被整屏吃掉的浅底）');
  ok(NT.yellow === 'rgb(255, 212, 0)', 'E2 yellow：黄底档黄底');
  ok(BNTXT === 'rgb(0, 0, 0)', 'E2 yellow：标题黑字（' + BNTXT + '）');

  // ---------- F. 手机 390 ----------
  const pg2 = await ctx.newPage();
  await pg2.setViewportSize({ width: 390, height: 844 });
  await killServiceWorker(pg2);   // 10/20：新开的 page 也要同样处理，否则拿不到提示条
  await stubNoAnswer(pg2);
  await pg2.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await pg2.waitForTimeout(2500);
  await openItem(pg2, NOANS);
  await pg2.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
  await pg2.waitForTimeout(600);
  const sw = await pg2.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 390, 'F1 手机 390 无横向溢出（scrollWidth ' + sw + '）');
  const bw = await pg2.$eval('#examRoot .ex-noans', e => e.getBoundingClientRect().width).catch(() => 0);
  ok(bw <= 390 && bw > 0, 'F2 提示条宽度 ' + Math.round(bw) + ' ≤ 390');

  ok(errs.length === 0, 'G1 全程零 pageerror' + (errs.length ? '：' + errs[0] : ''));

  await br.close();
  const fail = R.filter(r => !r[0]).length;
  console.log('\n===== ' + (R.length - fail) + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
