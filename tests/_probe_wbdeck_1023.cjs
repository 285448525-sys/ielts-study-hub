/* 4-3 验收：词书卡片网格（版一）
   验点：① 网格结构 = 每本书一张卡 + 末尾「+ 添加词书」 ② 卡上数字与真实数据一致
        ③ 点书卡能切到那本书（列表换成那本的词） ④ 加书只加卡、结构不变 ⑤ 375 单列不溢出
        ⑥ 深色下渐变/对比正常 ⑦ 原有 id 全在 ⑧ 空词库照常有引导
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_wbdeck_1023.cjs 8830 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8830';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  ' + x : '')); } };
const asleep = ms => new Promise(r => setTimeout(r, ms));

function seedScript(nWords) {
  return `(function(){
    var t = new Date();
    var k = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
    var ws = [];
    for(var i = 0; i < ${nWords}; i++){
      ws.push({ id: 'w'+i, en: 'word'+i, cn: '释义'+i,
                level: (i % 10 === 0 ? 5 : 1),
                cleared: (i % 10 === 0 ? true : false),
                nextReview: (i % 3 === 0 ? '2026-01-01' : k), ts: Date.now() });
    }
    try{ localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); }catch(e){}
  })();`;
}

/* WORD-4（10-26）把旧词书网格 #wbDeckGrid 视觉下线，只加 hidden；
   WORDBOOK-TABS-1（11-07）/ 11-13 商城默认页又让 wb-tabs.js 的 show('home') 隐藏整个 #wmLegacy。
   js/words.js 仍往 #wbDecks 写数据，DOM/id 都保留。旧探针量的是这层退役测试视图：
   等默认商城渲染完成后显式展开它，并另加一条当前商城可见卡片的等价值检查。 */
async function openBank(page) {
  await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const mall = document.getElementById('vMall');
    return mall && !mall.hidden && document.querySelector('#wmDeals .wm-deal');
  }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const bv = document.getElementById('bankView'); if (bv) bv.hidden = false;
    const mall = document.getElementById('vMall'); if (mall) mall.hidden = true;
    const book = document.getElementById('vBook'); if (book) book.hidden = true;
    const legacy = document.getElementById('wmLegacy'); if (legacy) legacy.hidden = false;
    /* 10-26 WORD-4：纯视觉退役；这里只在探针里恢复它，用来守住 words.js 的数据/布局契约。 */
    const grid = document.getElementById('wbDeckGrid'); if (grid) grid.hidden = false;
  });
  await page.waitForFunction(() => document.querySelectorAll('#wbDecks .wb-deck').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await asleep(600);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ========== A. 桌面 1440：结构 / 数字 / 点卡切书 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seedScript(30));
    await openBank(page);
    console.log('\n===== A 桌面 1440 =====');

    const r = await page.evaluate(() => {
      const decks = [...document.querySelectorAll('#wbDecks .wb-deck')].map(c => ({
        key: c.dataset.deck,
        name: (c.querySelector('.wb-deck-name') || {}).textContent,
        num: (c.querySelector('.wb-deck-num b') || {}).textContent,
        unit: (c.querySelector('.wb-deck-num span') || {}).textContent,
        foot: (c.querySelector('.wb-deck-foot') || {}).textContent,
        cur: c.classList.contains('cur')
      }));
      return {
        decks,
        addCard: !!document.getElementById('wbDeckAdd'),
        libSub: (document.getElementById('wbLibSub') || {}).textContent,
        gridCols: getComputedStyle(document.getElementById('wbDecks')).gridTemplateColumns.split(' ').length,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    });

    ok('词书网格渲染出书卡', r.decks.length >= 2, r.decks.length + ' 张');
    /* 11-13 当前产品默认 #vMall：退役网格之外，商城卡片必须真实可见且可点。 */
    const mallCard = await page.evaluate(async () => {
      const mall = document.getElementById('vMall'), legacy = document.getElementById('wmLegacy');
      if (mall) mall.hidden = false;
      if (legacy) legacy.hidden = true;
      if (window.__wmShowMall) window.__wmShowMall();
      if (window.__wmRender) window.__wmRender();
      await new Promise(r => setTimeout(r, 200));
      const card = document.querySelector('#wmDeals .wm-deal');
      const rect = card ? card.getBoundingClientRect() : null;
      return { n: document.querySelectorAll('#wmDeals .wm-deal').length,
               w: rect ? Math.round(rect.width) : 0, h: rect ? Math.round(rect.height) : 0 };
    });
    ok('11-13 当前词书商城卡片可见且可点（退役视图的等价值）',
      mallCard.n > 0 && mallCard.w >= 100 && mallCard.h >= 44, JSON.stringify(mallCard));
    await page.evaluate(() => {
      const mall = document.getElementById('vMall'); if (mall) mall.hidden = true;
      const legacy = document.getElementById('wmLegacy'); if (legacy) legacy.hidden = false;
      const grid = document.getElementById('wbDeckGrid'); if (grid) grid.hidden = false;
    });
    ok('自定义词库是第一张卡', r.decks[0] && r.decks[0].key === 'custom', r.decks[0] ? r.decks[0].name : '');
    ok('官方词包也有一张卡', r.decks.some(d => d.key !== 'custom'), r.decks.filter(d => d.key !== 'custom').map(d => d.name).join(','));
    ok('末尾有「+ 添加词书」虚线卡', r.addCard);
    // auto-fill minmax(240px,1fr)：1425 宽的内容区能塞 4 列（方案写的「3 列」是按 1024 左右的容器估的，以实际排布为准）
    ok('网格按可用宽度自动分列（1440 下 ≥3 列）', r.gridCols >= 3, r.gridCols + ' 列');
    ok('标题行报出书数与总词数', /共 \d+ 本 · 合计 \d+ 词/.test(r.libSub || ''), '「' + r.libSub + '」');
    ok('无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);

    // 数字核对：30 词里 i%3===0 的已过期（10 个），其余 nextReview=今天 → 全部到期；i%10===0 已掌握（3 个）
    const custom = r.decks[0];
    console.log('    我的词库卡：' + JSON.stringify(custom));
    // 实测口径：30 词里 3 个已掌握词被页面的「排程修复」推到明天 → 真正待复习 = 27，与页面自己算的一致
    ok('自定义书「待复习」= 27（30 词 - 3 个已排到明天）', custom && custom.num === '27', custom ? custom.num : '');
    ok('自定义书「已掌握」= 10%', custom && /10%/.test(custom.foot || ''), custom ? custom.foot : '');
    const off = r.decks.find(d => d.key !== 'custom');
    ok('官方书显示「已学 %」而不是待复习', off && /已学/.test(off.unit + ' ' + off.foot), off ? off.unit + ' | ' + off.foot : '');
    ok('当前书卡有 cur 标记', custom && custom.cur === true);
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));

    // 10-26 WORD-4 退役视图只由本探针测，不再把截图写进 design/（第六批本地维修边界）。
    // 点官方书卡 → 切库
    const before = await page.evaluate(() => (typeof wbActive === 'function' ? wbActive() : '?'));
    await page.evaluate(() => { const c = document.querySelector('#wbDecks .wb-deck[data-deck="awl"]'); if (c) c.click(); });
    await asleep(2600);   // 官方词包是异步 fetch，切过去要等它 ready
    const after = await page.evaluate(() => ({
      active: (typeof wbActive === 'function' ? wbActive() : '?'),
      curKey: (document.querySelector('#wbDecks .wb-deck.cur') || {}).dataset ? document.querySelector('#wbDecks .wb-deck.cur').dataset.deck : null,
      officialBtns: (document.getElementById('bankOfficialBtns') || {}).hidden,
      listRows: document.querySelectorAll('#wordList .wl-item').length
    }));
    ok('点官方书卡 → 切到那本书', before === 'custom' && after.active === 'awl', before + ' → ' + after.active);
    ok('切后卡上的 cur 标记跟着换', after.curKey === 'awl', String(after.curKey));
    ok('切后官方组的按钮露出来', after.officialBtns === false);
    ok('切后列表换成那本书的词', after.listRows > 0, after.listRows + ' 行');

    // 切回自定义
    await page.evaluate(() => { const c = document.querySelector('#wbDecks .wb-deck[data-deck="custom"]'); if (c) c.click(); });
    await asleep(900);
    const back = await page.evaluate(() => ({ active: wbActive(), rows: document.querySelectorAll('#wordList .wl-item').length }));
    ok('点回自定义书卡 → 切回来', back.active === 'custom' && back.rows > 0, back.active + ' / ' + back.rows + ' 行');

    // 「+ 添加词书」→ 展开导入条
    const add = await page.evaluate(() => {
      const b = document.getElementById('wbDeckAdd'); if (!b) return null;
      b.click();
      return { open: !document.getElementById('wlImpBody').hidden };
    });
    await asleep(400);
    ok('「+ 添加词书」展开导入条', add && add.open === true);
    await page.close();
  }

  // ========== B. 375 手机 ==========
  for (const vw of [375, 390]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(seedScript(20));
    await openBank(page);
    console.log('\n===== B 手机 ' + vw + ' =====');
    const r = await page.evaluate(() => {
      const deck = document.querySelector('#wbDecks .wb-deck');
      const rect = deck ? deck.getBoundingClientRect() : null;
      return {
        cols: getComputedStyle(document.getElementById('wbDecks')).gridTemplateColumns.split(' ').length,
        deckW: rect ? Math.round(rect.width) : 0,
        deckH: rect ? Math.round(rect.height) : 0,
        addH: Math.round((document.getElementById('wbDeckAdd') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    });
    ok(vw + ' 书卡单列', r.cols === 1, r.cols + ' 列');
    ok(vw + ' 书卡占满宽度', r.deckW > vw * 0.7, r.deckW + 'px / 视口 ' + vw);
    ok(vw + ' 书卡高度合理（可点）', r.deckH >= 44, r.deckH + 'px');
    ok(vw + ' 添加词书卡可点', r.addH >= 44, r.addH + 'px');
    ok(vw + ' 无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    ok(vw + ' 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ========== C. 深色 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.addInitScript(seedScript(30));
    await openBank(page);
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); try{ localStorage.setItem('hub_theme','dark'); }catch(e){} });
    await asleep(500);
    console.log('\n===== C 深色 =====');
    const r = await page.evaluate(() => {
      const deck = document.querySelector('#wbDecks .wb-deck');
      const name = deck.querySelector('.wb-deck-name');
      const num = deck.querySelector('.wb-deck-num b');
      const add = document.getElementById('wbDeckAdd');
      const cs = el => getComputedStyle(el);
      return {
        deckBg: cs(deck).backgroundColor, deckBorder: cs(deck).borderTopColor,
        nameColor: cs(name).color, numColor: cs(num).color,
        addColor: cs(add).color, addBorder: cs(add).borderTopColor,
        pageBg: cs(document.body).backgroundColor
      };
    });
    const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return null; const v = m.slice(0,3).map(x => { const s = Number(x)/255; return s <= .03928 ? s/12.92 : Math.pow((s+.055)/1.055, 2.4); }); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
    const con = (a,b) => { const la = lum(a), lb = lum(b); if (la==null||lb==null) return 0; const hi = Math.max(la,lb), lo = Math.min(la,lb); return (hi+.05)/(lo+.05); };
    ok('深色下书卡底色与页面底有区分', con(r.deckBg, r.pageBg) >= 1.1, r.deckBg + ' vs ' + r.pageBg + ' = ' + con(r.deckBg, r.pageBg).toFixed(2));
    ok('深色下书名可读', con(r.nameColor, r.deckBg) >= 4.5, r.nameColor + ' = ' + con(r.nameColor, r.deckBg).toFixed(2) + ':1');
    ok('深色下待复习数字可读', con(r.numColor, r.deckBg) >= 4.5, r.numColor + ' = ' + con(r.numColor, r.deckBg).toFixed(2) + ':1');
    ok('深色下添加卡文字可读', con(r.addColor, r.pageBg) >= 3, r.addColor + ' = ' + con(r.addColor, r.pageBg).toFixed(2) + ':1');
    await page.close();
  }

  // ========== D. 空词库：引导仍在，网格照常 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try{ localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: [], settings: {}, sessions: [] })); }catch(e){} });
    await openBank(page);
    console.log('\n===== D 空词库 =====');
    const r = await page.evaluate(() => {
      const decks = [...document.querySelectorAll('#wbDecks .wb-deck')];
      const add = document.getElementById('wbDeckAdd');
      /* 11-12 空态统一卡 renderEmpty() 包成 .esys--compat；原 .empty-t / #emptyOpenImport 内容保留。 */
      const empty = document.querySelector('#wordList .esys--compat, #wordList .empty');
      return {
        deckN: decks.length,
        custom: decks[0] ? { num: (decks[0].querySelector('.wb-deck-num b')||{}).textContent, meta: (decks[0].querySelector('.wb-deck-meta')||{}).textContent } : null,
        hasAdd: !!add,
        emptyText: empty ? empty.textContent.slice(0, 40) : null,
        emptyBtn: !!document.getElementById('emptyOpenImport'),
        todaysHidden: (document.getElementById('wbTodayCard')||{}).hidden
      };
    });
    ok('空词库时书卡依然在（不消失）', r.deckN >= 2, r.deckN + ' 张');
    ok('空词库的书卡老实写「还没有单词」', r.custom && /还没有单词/.test(r.custom.meta || ''), r.custom ? r.custom.meta + ' / 待复习 ' + r.custom.num : '');
    ok('空词库的待复习数是 0', r.custom && r.custom.num === '0');
    ok('「+ 添加词书」卡还在', r.hasAdd);
    ok('空词库仍有列表空态引导（统一 .esys 卡）', !!r.emptyText && !!r.emptyBtn, r.emptyText || '');
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
