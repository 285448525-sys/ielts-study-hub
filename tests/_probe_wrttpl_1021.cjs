/* 10-21 写作模板页两条（她拍板 design/112）：
   ① 模板卡直接露「结构提示 + 骨架首句」——不点开也能判断这套要不要用；
   ② 新增「列表视图」（网格/列表两态，选择记 localStorage）。
   本支只用自建模板做验证：把 curCat 指到一个不存在的分类「探针专用」，
   避开出厂模板补齐（ensureWriting 会往 DATA.writing 里补官方模板）带来的条数波动。
   用法：node tests/_with_server.cjs tests/_probe_wrttpl_1021.cjs 8857 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8857';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

const TIPS_A = '先直接表态【立场】，再给两个理由【理由一】/【理由二】，最后回扣。';
const SK_A = 'First sentence here. Second sentence follows.\n\nThird paragraph starts here. And more sentences.';
const SEED = JSON.stringify({
  settings: { examDate: '2026-12-01' },
  words: [],
  writing: [
    { id: 'p1a', level: '5.5', category: '探针专用', title: '模板甲', skeleton: SK_A, tips: TIPS_A },
    { id: 'p1b', level: '7.0', category: '探针专用', title: '模板乙',
      skeleton: 'The chart illustrates【图表类型】. It is clear that【主要趋势】.', tips: '开头一句改写题干，别抄原句。' },
    { id: 'p1c', level: '5.5', category: '探针专用', title: '模板丙', skeleton: 'No period here at all', tips: '' },
  ],
  writingPhrases: [],
});

async function boot(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(sd => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      localStorage.setItem('ielts_study_hub_v1', sd);
      localStorage.removeItem('hub_auth_token');
    } catch (e) {}
  }, SEED);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(BASE + '/writing.html', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  /* 固定到「探针专用」分类，隔离出厂模板补齐 */
  await p.evaluate(() => { curCat = '探针专用'; curLevel = 'all'; tplSearch = ''; renderList(); });
  await sleep(300);
  return { ctx, p, errs };
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ① 默认网格态：卡片露结构提示 + 骨架首句 */
  {
    const { ctx, p, errs } = await boot(b);
    const r = await p.evaluate(() => {
      const box = document.getElementById('tplList');
      const cards = Array.from(box.querySelectorAll('.tpl-card'));
      const byId = id => box.querySelector('.tpl-card[data-id="' + id + '"]');
      const txt = (el, sel) => { const x = el && el.querySelector(sel); return x ? (x.textContent || '').trim() : null; };
      const a = byId('p1a');
      return {
        cls: box.className,
        n: cards.length,
        ids: cards.map(c => c.dataset.id),
        tipA: txt(a, '.tpl-tip'),
        skA: txt(a, '.tpl-sk'),
        footA: txt(a, '.tpl-foot'),
        lvA: txt(a, '.tpl-lv'),
        skC: txt(byId('p1c'), '.tpl-sk'),
        tipC: byId('p1c') ? !!byId('p1c').querySelector('.tpl-tip') : null,
        locks: Array.from(box.querySelectorAll('.tpl-card .badge')).length,
        viewBtns: Array.from(document.querySelectorAll('#tplView [data-view]')).map(x => x.dataset.view + ':' + x.classList.contains('active')),
      };
    });
    ok('①1 默认是网格态（#tplList 带 grid）', r.cls === 'grid', r.cls);
    ok('①2 只有本分类的 3 张卡', r.n === 3, r.n + ' / ' + JSON.stringify(r.ids));
    ok('①3 卡片直接露结构提示（与数据原文一致，含【】槽位）', r.tipA === TIPS_A, JSON.stringify(r.tipA));
    ok('①4 骨架首句只到第一个句号', r.skA === 'First sentence here.', JSON.stringify(r.skA));
    ok('①5 卡上标了段落数（2 段）', r.footA === '2 段打开模板 →', JSON.stringify(r.footA));
    ok('①6 档位徽章仍在', r.lvA === '目标 5.5 分', JSON.stringify(r.lvA));
    ok('①7 无句号的骨架整段兜底显示', r.skC === 'No period here at all', JSON.stringify(r.skC));
    ok('①8 tips 为空不渲染空行', r.tipC === false, String(r.tipC));
    /* W-FREE-3：作文页全免费，锁角标已撤（她 10-25「作文页也得是免费给所有人用的」）。 */
    ok('①9 非会员每张卡都**没有**锁角标（模板库已免费）', r.locks === 0, r.locks);
    ok('①10 视图切换按钮两枚、网格为选中态', JSON.stringify(r.viewBtns) === JSON.stringify(['grid:true', 'list:false']), JSON.stringify(r.viewBtns));
    ok('①11 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ② 切到列表视图 + 刷新记住 */
  {
    const { ctx, p, errs } = await boot(b);
    await p.click('#tplView [data-view="list"]');
    await sleep(400);
    const r = await p.evaluate(() => {
      const box = document.getElementById('tplList');
      const rows = Array.from(box.querySelectorAll('.tl-row'));
      const data = rows.filter(x => !x.classList.contains('th'));
      return {
        cls: box.className, rows: rows.length, data: data.length,
        head: rows[0] ? (rows[0].textContent || '').trim() : '',
        first: data[0] ? (data[0].textContent || '').trim() : '',
        firstT: data[0] ? (data[0].querySelector('.tl-t') || {}).textContent.trim() : '',
        firstSub: data[0] ? (data[0].querySelector('.tl-sub') || {}).textContent.trim() : '',
        firstLock: data[0] ? !!data[0].querySelector('.tl-lock') : null,
        firstCat: data[0] ? (data[0].querySelector('.tl-cat') || {}).textContent.trim() : '',
        isCard: !!box.querySelector('.tpl-card'),
        stored: localStorage.getItem('wrtTplView'),
        btns: Array.from(document.querySelectorAll('#tplView [data-view]')).map(x => x.dataset.view + ':' + x.classList.contains('active')),
      };
    });
    ok('②1 列表态生效（#tplList 换成 tpl-list）', r.cls === 'tpl-list', r.cls);
    ok('②2 1 行表头 + 3 行数据', r.rows === 4 && r.data === 3, r.rows + '/' + r.data);
    ok('②3 表头列名正确', r.head === '目标分模板 / 结构提示题型段数打开', JSON.stringify(r.head));
    /* W-FREE-3：锁图标撤掉后，行内文本从「5.5🔒模板甲…」变成「5.5模板甲…」。 */
    ok('②4 行内行含档位/标题/提示/段数/打开', r.first === '5.5模板甲' + TIPS_A + '探针专用2 段打开 →', JSON.stringify(r.first));
    ok('②5 标题与提示分行显示', r.firstT === '模板甲' && r.firstSub === TIPS_A, JSON.stringify([r.firstT, r.firstSub]));
    /* W-FREE-3：同 ①9 —— 列表行也不再带锁标记。 */
    ok('②6 列表行也**不带**会员锁标记', r.firstLock === false, String(r.firstLock));
    ok('②7 列表态不再渲染卡片（同一份 HTML 只有一套 DOM）', r.isCard === false, String(r.isCard));
    ok('②8 选择记进 localStorage', r.stored === 'list', String(r.stored));
    ok('②9 按钮选中态跟到列表', JSON.stringify(r.btns) === JSON.stringify(['grid:false', 'list:true']), JSON.stringify(r.btns));

    await p.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const r2 = await p.evaluate(() => {
      const box = document.getElementById('tplList');
      return { cls: box.className, hasListBtn: !!document.querySelector('#tplView [data-view="list"]') };
    });
    ok('②10 刷新后仍留在列表视图（不每次回网格）', r2.cls === 'tpl-list', r2.cls);

    await p.evaluate(() => { curCat = '探针专用'; renderList(); });
    await p.click('#tplView [data-view="grid"]');
    await sleep(300);
    const r3 = await p.evaluate(() => ({
      cls: document.getElementById('tplList').className,
      cards: document.querySelectorAll('#tplList .tpl-card').length,
      stored: localStorage.getItem('wrtTplView'),
    }));
    ok('②11 切回网格生效并记住', r3.cls === 'grid' && r3.stored === 'grid' && r3.cards === 3,
      JSON.stringify(r3));
    ok('②12 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ③ 两种视图与筛选正交（切视图不丢筛选、筛选不受视图影响） */
  {
    const { ctx, p } = await boot(b);
    await p.evaluate(() => { curLevel = '7.0'; renderList(); });
    await sleep(200);
    const g = await p.evaluate(() => ({
      cards: document.querySelectorAll('#tplList .tpl-card').length,
      lv: Array.from(document.querySelectorAll('#tplList .tpl-lv')).map(x => x.textContent.trim()),
    }));
    ok('③1 网格态目标分筛选生效（只剩 7.0 那条）', g.cards === 1 && g.lv[0] === '目标 7.0 分',
      JSON.stringify(g));

    await p.click('#tplView [data-view="list"]');
    await sleep(300);
    const l = await p.evaluate(() => ({
      data: document.querySelectorAll('#tplList .tl-row:not(.th)').length,
      lv: Array.from(document.querySelectorAll('#tplList .tl-row:not(.th) .tpl-lv')).map(x => x.textContent.trim()),
    }));
    ok('③2 切到列表仍保持 7.0 筛选（不是全量）', l.data === 1 && l.lv[0] === '7.0', JSON.stringify(l));

    const s = await p.evaluate(() => {
      tplSearch = '模板甲'; renderList();
      const n = document.querySelectorAll('#tplList .tl-row:not(.th)').length;
      curLevel = 'all'; tplSearch = ''; renderList();
      return { searched: n, back: document.querySelectorAll('#tplList .tl-row:not(.th)').length };
    });
    ok('③3 列表态搜索仍生效、清空后恢复', s.searched === 0 && s.back === 3, JSON.stringify(s));
    await ctx.close();
  }

  await b.close();
  console.log('\n[wrttpl_1021] 通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });