/* 4-4 验收：进书视图（面包屑 + 一行状态胶囊）
   验点：① 面包屑在、点在「词书库」能回上去 ② 面包屑写的是当前这本书的名字
        ③ 胶囊 5 枚都在，数字与书卡一致 ④ 点「已过期」只剩过期词 ⑤ 点「已掌握」同理
        ⑥ 胶囊筛选不套分组头（不出现「已过期」组里再挂「已过期」头）
        ⑦ 空库时面包屑不显 ⑧ 切书时筛子回「全部」 ⑨ 375 不溢出、胶囊可点
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_wbview_1023.cjs 8840 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8840';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  ' + x : '')); } };
const asleep = ms => new Promise(r => setTimeout(r, ms));

const seed = n => `(function(){
  var t = new Date();
  var k = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  var ws = [];
  for(var i = 0; i < ${n}; i++){
    ws.push({ id:'w'+i, en:'word'+i+(i%7===0?' phrase':'') , cn:'释义'+i,
              level: (i % 5 === 0 ? 5 : 1),
              cleared: (i % 5 === 0),
              nextReview: (i % 4 === 0 ? '2026-01-01' : (i % 3 === 0 ? '2027-01-01' : k)),
              errTotal: (i % 6 === 0 ? 3 : 0),
              ts: Date.now() });
  }
  try{ localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); }catch(e){}
})();`;

async function openBank(page) {
  await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await asleep(900);
  await page.evaluate(() => {
    const t = document.querySelector('[data-wtab="bank"]');
    if (t) t.click();
    document.getElementById('bankView').hidden = false;
  });
  await asleep(600);
}

async function shot(page, name) { await page.screenshot({ path: 'C:\\Users\\Camille\\Desktop\\雅思\\design\\_shot_' + name + '.png' }); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ========== A. 桌面：面包屑 + 胶囊 + 筛选 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seed(40));
    await openBank(page);
    console.log('\n===== A 桌面 1440 =====');

    const r = await page.evaluate(() => {
      const nav = document.getElementById('wbCrumb');
      const chips = [...document.querySelectorAll('#wbStatusChips .wb-chip')].map(b => ({
        st: b.dataset.st, label: b.textContent.replace(/\d+$/, '').trim(),
        n: Number((b.querySelector('.wb-chip-n') || {}).textContent), act: b.classList.contains('active')
      }));
      const st = wbStatusCounts(wbWords());
      const deck = document.querySelector('#wbDecks .wb-deck[data-deck="custom"]');
      return {
        crumbShown: nav && !nav.hidden,
        crumbCur: (document.getElementById('wbCrumbCur') || {}).textContent,
        crumbBack: (document.getElementById('wbCrumbBack') || {}).textContent,
        chips,
        counts: st,
        deckDue: deck ? Number((deck.querySelector('.wb-deck-num b') || {}).textContent) : null,
        catsHidden: document.getElementById('wordCats').hidden,
        rows: document.querySelectorAll('#wordList .wl-item').length,
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth
      };
    });

    ok('面包屑显示出来了', r.crumbShown);
    ok('面包屑写的是当前书「我的词库」', r.crumbCur === '我的词库', r.crumbCur);
    ok('面包屑左边是可以点回去的「词书库」', r.crumbBack === '词书库', r.crumbBack);
    ok('5 枚状态胶囊都在', r.chips.length === 5, r.chips.map(c => c.label + c.n).join(' · '));
    ok('默认选中「全部」', r.chips[0].st === 'all' && r.chips[0].act);
    ok('胶囊的「全部」= 词库总词数', r.chips[0].n === 40, String(r.chips[0].n));
    ok('胶囊的「待复习」与书卡数字一致', r.chips[1].n === r.deckDue, r.chips[1].n + ' vs ' + r.deckDue);
    ok('胶囊的「已过期」与统计一致', r.chips[2].n === r.counts.overdue, r.chips[2].n + ' vs ' + r.counts.overdue);
    ok('胶囊的「已掌握」与统计一致', r.chips[4].n === r.counts.mastered, r.chips[4].n + ' vs ' + r.counts.mastered);
    ok('旧的「类型/错误」两级按钮已收起', r.catsHidden === true);
    ok('默认显示全部词', r.rows > 0, r.rows + ' 行');
    ok('无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await shot(page, 'wbview_1440_1023');

    // 点「已过期」
    const overdueN = r.counts.overdue;
    await page.evaluate(() => document.querySelector('#wbStatusChips .wb-chip[data-st="overdue"]').click());
    await asleep(600);
    const f1 = await page.evaluate(() => ({
      rows: document.querySelectorAll('#wordList .wl-item').length,
      act: (document.querySelector('#wbStatusChips .wb-chip.active') || {}).dataset.st,
      groupHeads: document.querySelectorAll('#wordList .wl-group-h').length,
      allChipN: Number(document.querySelector('#wbStatusChips .wb-chip[data-st="all"] .wb-chip-n').textContent)
    }));
    ok('点「已过期」→ 列表只剩过期词', f1.rows === overdueN, f1.rows + ' / 应有 ' + overdueN);
    ok('点「已过期」→ 胶囊高亮跟着换', f1.act === 'overdue');
    ok('点「已过期」→ 不套分组头（不再出现「已过期」组）', f1.groupHeads === 0, f1.groupHeads + ' 个组头');
    ok('筛完「全部」的数字不缩水', f1.allChipN === 40, String(f1.allChipN));

    // 点「已掌握」
    await page.evaluate(() => document.querySelector('#wbStatusChips .wb-chip[data-st="mastered"]').click());
    await asleep(600);
    const f2 = await page.evaluate(() => ({ rows: document.querySelectorAll('#wordList .wl-item').length }));
    ok('点「已掌握」→ 只剩已掌握词', f2.rows === r.counts.mastered, f2.rows + ' / 应有 ' + r.counts.mastered);

    // 点「答错」
    await page.evaluate(() => document.querySelector('#wbStatusChips .wb-chip[data-st="err"]').click());
    await asleep(600);
    const f3 = await page.evaluate(() => ({ rows: document.querySelectorAll('#wordList .wl-item').length }));
    ok('点「答错」→ 只剩答错过的词', f3.rows === r.counts.err, f3.rows + ' / 应有 ' + r.counts.err);

    // 面包屑「词书库」→ 清筛选 + 回到上面
    await page.evaluate(() => document.getElementById('wbCrumbBack').click());
    await asleep(700);
    const b = await page.evaluate(() => ({
      act: (document.querySelector('#wbStatusChips .wb-chip.active') || {}).dataset.st,
      rows: document.querySelectorAll('#wordList .wl-item').length,
      gridTop: window.scrollY
    }));
    ok('点面包屑「词书库」→ 筛选清回「全部」', b.act === 'all');
    ok('点面包屑「词书库」→ 列表回到全部词', b.rows > r.counts.err, b.rows + ' 行');

    await page.close();
  }

  // ========== B. 切书：面包屑换成书名 + 筛子回全部 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seed(40));
    await openBank(page);
    console.log('\n===== B 切书 =====');
    // 先选一个筛子
    await page.evaluate(() => document.querySelector('#wbStatusChips .wb-chip[data-st="overdue"]').click());
    await asleep(500);
    // 切到 AWL
    await page.evaluate(() => document.querySelector('#wbDecks .wb-deck[data-deck="awl"]').click());
    await asleep(2800);
    const r = await page.evaluate(() => ({
      cur: (document.getElementById('wbCrumbCur') || {}).textContent,
      act: (document.querySelector('#wbStatusChips .wb-chip.active') || {}).dataset.st,
      rows: document.querySelectorAll('#wordList .wl-item').length,
      cardName: (document.querySelector('#wbDecks .wb-deck[data-deck="awl"] .wb-deck-name') || {}).textContent,
      chipsN: (document.getElementById('wbStatusChips') || {}).children.length
    }));
    ok('切到 AWL → 面包屑换成那本书的名字', r.cur === 'AWL' || (r.cardName && r.cur === r.cardName), r.cur);
    ok('切到 AWL → 筛子自动回「全部」', r.act === 'all');
    ok('切到 AWL → 列表是那本书的词', r.rows > 0, r.rows + ' 行');
    ok('切到 AWL → 胶囊还在（5 枚）', r.chipsN === 5, String(r.chipsN));
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await shot(page, 'wbview_awl_1023');
    await page.close();
  }

  // ========== C. 375 手机 ==========
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seed(24));
    await openBank(page);
    console.log('\n===== C 手机 375 =====');
    const r = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#wbStatusChips .wb-chip')];
      const back = document.getElementById('wbCrumbBack');
      const bb = back.getBoundingClientRect();
      return {
        chipN: chips.length,
        chipH: chips.length ? Math.round(chips[0].getBoundingClientRect().height) : 0,
        chipMinW: chips.length ? Math.min(...chips.map(c => Math.round(c.getBoundingClientRect().width))) : 0,
        backH: Math.round(bb.height),
        crumbShown: !document.getElementById('wbCrumb').hidden,
        crumbCur: (document.getElementById('wbCrumbCur') || {}).textContent,
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth
      };
    });
    ok('375 胶囊都在', r.chipN === 5, String(r.chipN));
    ok('375 胶囊高度可点（>=32）', r.chipH >= 32, r.chipH + 'px');
    ok('375 面包屑在', r.crumbShown && r.crumbCur === '我的词库', r.crumbCur);
    ok('375 面包屑返回键可点', r.backH >= 32, r.backH + 'px');
    ok('375 无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    ok('375 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    // 手机上也点一下筛选
    await page.evaluate(() => document.querySelector('#wbStatusChips .wb-chip[data-st="overdue"]').click());
    await asleep(500);
    const f = await page.evaluate(() => ({ act: (document.querySelector('#wbStatusChips .wb-chip.active') || {}).dataset.st }));
    ok('375 点胶囊能筛', f.act === 'overdue', String(f.act));
    await shot(page, 'wbview_375_1023');
    await page.close();
  }

  // ========== D. 空词库：面包屑不出现 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: [], settings: {}, sessions: [] })); } catch (e) {} });
    await openBank(page);
    console.log('\n===== D 空词库 =====');
    const r = await page.evaluate(() => ({
      crumbHidden: document.getElementById('wbCrumb').hidden,
      chips: document.querySelectorAll('#wbStatusChips .wb-chip').length,
      emptyText: (document.querySelector('#wordList .empty') || {}).textContent || ''
    }));
    ok('空词库 → 面包屑不显示（没东西可指路）', r.crumbHidden === true);
    ok('空词库 → 仍有空态引导', /还没有单词/.test(r.emptyText), r.emptyText.slice(0, 28));
    ok('空词库 → 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
