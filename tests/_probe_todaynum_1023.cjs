/* 10-23 探针：备考页「今天要复习」三处数字必须同口径
   背景：她 10-23 报「今日卡写 32、书卡写 24，到底哪个对」。
   根因：今日卡按 wordIntervalDesc().overdue 数（只算逾期），列表组按 info.next 有值就收（连 70 天后的也算），
        书卡/胶囊按 nextReview <= 今天。三个口径 → 三个数。
   修法：三处统一到 wbWordState().due（nextReview 空或 <= 今天）。
   验点：① 今日卡标题数字 == 书卡「待复习」== 胶囊「待复习」 ② 今日卡的四个小格加起来能对上标题
        ③ 列表「今天要复习」组里没有未来才到期的词 ④ 空词库/全掌握两种边界不炸

   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_todaynum_1023.cjs 8850 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8850';
const EXE = process.env.PW_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  ' + x : '')); } };
const asleep = ms => new Promise(r => setTimeout(r, ms));

// 24 词：6 个 Lv5 已掌握、4 个已逾期、4 个今天到期、10 个在未来
const seedMix = `(function(){
  var t = new Date();
  var k = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  var ws = [];
  for(var i=0;i<24;i++){
    var nr = k, lv = 1, cl = false;
    if(i % 5 === 0){ lv = 5; cl = true; nr = '2026-10-24'; }        // 6 个已掌握，排到明天
    else if(i % 4 === 1){ nr = '2026-01-01'; }                       // 逾期
    else if(i % 3 === 0){ nr = '2027-01-01'; }                       // 远未来
    ws.push({ id:'w'+i, en:'word'+i, cn:'解释'+i, level:lv, cleared:cl, nextReview:nr,
              errTotal:(i%6===0?3:0), ts:Date.now() });
  }
  try{ localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); }catch(e){}
})();`;

async function openBank(page) {
  await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await asleep(1100);
  await page.evaluate(() => {
    const t = document.querySelector('[data-wtab="bank"]');
    if (t) t.click();
    document.getElementById('bankView').hidden = false;
  });
  await asleep(700);
}

const read = () => ({
  today: todayKey(),
  total: (wbWords() || []).length,
  dueByState: (wbWords() || []).filter(w => wbWordState(w).due).length,
  dueByNR: (wbWords() || []).filter(w => !w.nextReview || w.nextReview <= todayKey()).length,
  todayTitle: (document.getElementById('wbTodayTitle') || {}).textContent || '',
  todayHidden: !!(document.getElementById('wbTodayCard') || {}).hidden,
  todaySub: (document.getElementById('wbTodaySub') || {}).textContent || '',
  cardNum: (document.querySelector('#wbDecks .wb-deck[data-deck="custom"] .wb-deck-num b') || {}).textContent,
  cardUnit: (document.querySelector('#wbDecks .wb-deck[data-deck="custom"] .wb-deck-num span') || {}).textContent,
  chipDue: (document.querySelector('#wbStatusChips .wb-chip[data-st="due"] .wb-chip-n') || {}).textContent,
  dueGroupN: (() => {
    const g = groupByStatus(wbWords() || []).find(x => x.key === 's-due');
    return g ? g.items.length : 0;
  })(),
  dueGroupAllReallyDue: (() => {
    const g = groupByStatus(wbWords() || []).find(x => x.key === 's-due');
    if (!g) return true;
    return g.items.every(w => wbWordState(w).due);
  })(),
  overdueCard: (document.getElementById('wbNOverdue') || {}).textContent,
  newCard: (document.getElementById('wbNNew') || {}).textContent
});

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ---- A. 混合词库：三处数字必须一致 ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seedMix);
    await openBank(page);
    console.log('\n===== A 混合词库（24 词）=====');
    const r = await page.evaluate(read);
    console.log('    ' + JSON.stringify({ title: r.todayTitle, sub: r.todaySub, card: r.cardNum + r.cardUnit, chip: r.chipDue, group: r.dueGroupN, dueByState: r.dueByState, dueByNR: r.dueByNR }));

    ok('书卡的「待复习」= 真到期数', String(r.dueByState) === String(r.cardNum), r.cardNum + ' vs ' + r.dueByState);
    ok('胶囊的「待复习」= 书卡', r.chipDue === r.cardNum, r.chipDue + ' vs ' + r.cardNum);
    ok('列表「今天要复习」组 = 书卡', String(r.dueGroupN) === String(r.cardNum), r.dueGroupN + ' vs ' + r.cardNum);
    const m = r.todayTitle.match(/(\d+)\s*个词/);
    ok('今日卡标题的数字 = 书卡', m && m[1] === String(r.cardNum), r.todayTitle + ' vs 书卡 ' + r.cardNum);
    ok('「今天要复习」组里没有未来才到期的词', r.dueGroupAllReallyDue === true);
    ok('今日卡的「已过期 + 新高频」加起来 = 标题', (Number(r.overdueCard) + Number(r.newCard)) === Number(r.cardNum),
      r.overdueCard + ' + ' + r.newCard + ' = ' + (Number(r.overdueCard) + Number(r.newCard)) + ' / 标题 ' + r.cardNum);
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ---- B. 全部远未来（今天一个都不该复习）----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => {
      const ws = [];
      for (let i = 0; i < 10; i++) ws.push({ id: 'f' + i, en: 'future' + i, cn: '未来' + i, level: 1, cleared: false, nextReview: '2027-06-01', ts: Date.now() });
      try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); } catch (e) {}
    });
    await openBank(page);
    console.log('\n===== B 全部排在未来 =====');
    const r = await page.evaluate(read);
    ok('全部在未来 → 书卡待复习 0', r.cardNum === '0', String(r.cardNum));
    ok('全部在未来 → 胶囊待复习 0', r.chipDue === '0', String(r.chipDue));
    ok('全部在未来 → 今日卡不说「要复习 N 个」', !/今天要复习 \d+ 个词/.test(r.todayTitle), r.todayTitle);
    ok('全部在未来 → 列表组「今天要复习」是空的', r.dueGroupN === 0, String(r.dueGroupN));
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ---- C. 空词库 ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: [], settings: {}, sessions: [] })); } catch (e) {} });
    await openBank(page);
    console.log('\n===== C 空词库 =====');
    const r = await page.evaluate(read);
    ok('空词库 → 书卡待复习 0', r.cardNum === '0', String(r.cardNum));
    ok('空词库 → 列表组不炸', r.dueGroupN === 0);
    // 空词库时今日卡整块不显示（标题里残留的初始文案看不见，不算数）
    ok('空词库 → 今日卡整块藏起来', r.todayHidden === true, '藏起=' + r.todayHidden);
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
