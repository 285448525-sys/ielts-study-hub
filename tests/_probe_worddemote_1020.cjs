/* 10-20 深夜 词库两件：① 已有词重新导入改「降一级」（她拍板「改吧」）② 删掉「AI 补全」按钮 +
      撤销我上一批加的「合并重复词」按钮，两者下沉为进页面自动静默整理（autoTidyWords）。
   她原话：「我其实想把 AI 补全这个按钮去掉，你还给我又加一个按钮，我希望这个功能导入的时候就是完全体」。

   本支不发真实 AI 请求（拦 api/ai 返固定 JSON）。
   用法：node tests/_with_server.cjs tests/_probe_worddemote_1020.cjs 8857 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8857';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

/* 🔴 日期断言的「锚点必须从页面取，且加减用本地时间做」—— 别再用 `new Date().toISOString()`。
   坑（10/21 00:03 踩）：页面 todayKey() 走**本地时间**（北京 UTC+8），Node 端 toISOString() 走 **UTC**。
   北京时间 00:00~08:00 这段，UTC 还是「前一天」→ 期望值比实际小一天 → 每天这 8 小时必然误报，
   而白天跑又全绿（最坑的那种偶发红）。现在：out.today 由页面 todayKey() 给，加减在 Node 用
   本地 Date 构造（new Date(y, m-1, d) 而非 'YYYY-MM-DD' 字符串解析，后者会按 UTC 解释）。 */
function addDaysLocal(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const FAKE = '[{"en":"apple","cn":"苹果","pos":"n.","ipa":"/ˈæpl/"}]';

async function boot(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route('**/api/ai', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: FAKE } }] }) });
  });
  const seed = opts.seed || null;
  await p.addInitScript(([tok, sd]) => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
      if (tok) localStorage.setItem('hub_auth_token', tok); else localStorage.removeItem('hub_auth_token');
      if (sd) localStorage.setItem('ielts_study_hub_v1', sd);
    } catch (e) {}
  }, [opts.token ? 'fake-session-token' : '', seed]);
  await p.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  return { ctx, p, errs };
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ① 按钮确实没了（DOM 层，不是 CSS 隐藏） */
  {
    const { ctx, p, errs } = await boot(b, { token: true });
    const r = await p.evaluate(() => ({
      backfill: !!document.getElementById('backfillBtn'),
      mergeDup: !!document.getElementById('mergeDupBtn'),
      customBtns: Array.from(document.querySelectorAll('#bankCustomBtns button')).map(x => (x.textContent || '').trim()),
      hasBackfillFn: (typeof window.backfillCn === 'function'),
    }));
    ok('①1 「AI 补全」按钮 #backfillBtn 已从页面移除', r.backfill === false, JSON.stringify(r.backfill));
    ok('①2 「合并重复词」按钮 #mergeDupBtn 也已撤销', r.mergeDup === false, JSON.stringify(r.mergeDup));
    ok('①3 词库头部自定义按钮只剩「复习计划」', r.customBtns.length === 1 && r.customBtns[0] === '复习计划', JSON.stringify(r.customBtns));
    ok('①4 处理器 backfillCn() 已整体删除', r.hasBackfillFn === false, JSON.stringify(r.hasBackfillFn));
    ok('①5 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ② 自动整理接住了原来两个按钮的活 */
  {
    const { ctx, p, errs } = await boot(b, { token: true });
    const r = await p.evaluate(() => ({
      autoTidy: (typeof window.autoTidyWords === 'function'),
      mergeFn: (typeof window.mergeDuplicateWords === 'function'),
      resetFn: (typeof window.resetWordProgress === 'function'),
      demoteFn: (typeof window.demoteWordProgress === 'function'),
    }));
    ok('②1 autoTidyWords() 存在（接管了原「AI 补全」按钮的清洗活）', r.autoTidy === true, String(r.autoTidy));
    ok('②2 mergeDuplicateWords() 仍存在（改为自动调用）', r.mergeFn === true, String(r.mergeFn));
    ok('②3 resetWordProgress() 保留 —— 只给「新建词」用', r.resetFn === true, String(r.resetFn));
    ok('②4 demoteWordProgress() 新增 —— 已有词重新导入走它', r.demoteFn === true, String(r.demoteFn));
    ok('②5 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ③ demoteWordProgress 的降级口径（单元级） */
  {
    const { ctx, p } = await boot(b, { token: true });
    const r = await p.evaluate(() => {
      const mk = lv => ({ id: 'x' + lv, en: 'w' + lv, cn: '释义', level: lv, dh: [1,2,4,7,15,30,60,90][lv],
        nextReview: '2020-01-01', lastReview: '2020-01-01', errTotal: 5, errStreak: 2, okStreak: 3,
        hist: [{ d: '2020-01-01', r: 'ok' }], hardWord: true, keyWord: false, ts: 1, dd: 3 });
      const out = {};
      // 3 → 2
      const a = demoteWordProgress(mk(3));
      out.lv32 = a.level; out.dh32 = a.dh; out.nr32 = a.nextReview; out.cleared32 = a.cleared;
      // 0 → 0（最早降到 0，不越界）
      const b0 = demoteWordProgress(mk(0));
      out.lv00 = b0.level; out.dh00 = b0.dh; out.nr00 = b0.nextReview;
      // 历史与主观标注保留
      out.errTotal = a.errTotal; out.histLen = a.hist.length; out.hardWord = a.hardWord;
      out.okStreak = a.okStreak; out.errStreak = a.errStreak; out.lastReview = a.lastReview;
      out.dd = a.dd; out.ts = a.ts;
      // epoch 递增（跨设备传播靠它）
      const c = { level: 3, resetEpoch: 4 };
      demoteWordProgress(c);
      out.epoch = c.resetEpoch;
      out.today = todayKey();
      return out;
    });
    ok('③1 Lv 3 重新导入 → Lv 2（降一级，不是归零）', r.lv32 === 2, 'level=' + r.lv32);
    ok('③2 Lv 3 → dh 同步降到 4（不动 dh 的话下次答对会把它算回原等级）', r.dh32 === 4, 'dh=' + r.dh32);
    ok('③3 Lv 3 → 下次复习 = 今天+4 天', r.nr32 === addDaysLocal(r.today, 4), 'nextReview=' + r.nr32 + ' today=' + r.today + ' 期望=' + addDaysLocal(r.today, 4));
    ok('③4 cleared 置 false（降过级一律回复习队列）', r.cleared32 === false, String(r.cleared32));
    ok('③5 Lv 0 再降不越界，停在 0', r.lv00 === 0, 'level=' + r.lv00);
    ok('③6 Lv 0 → dh = 1、下次复习 = 明天', r.dh00 === 1 && r.nr00 === addDaysLocal(r.today, 1), 'dh=' + r.dh00 + ' nextReview=' + r.nr00 + ' 期望=' + addDaysLocal(r.today, 1));
    ok('③7 累计错次 errTotal 保留（历史不抹）', r.errTotal === 5, 'errTotal=' + r.errTotal);
    ok('③8 作答历史 hist 保留', r.histLen === 1, 'hist=' + r.histLen);
    ok('③9 难词 hardWord 主观标注保留', r.hardWord === true, String(r.hardWord));
    ok('③10 连击 okStreak/errStreak 归零（短期状态，退一档即断开）', r.okStreak === 0 && r.errStreak === 0, 'ok=' + r.okStreak + ' err=' + r.errStreak);
    ok('③11 lastReview / dd / ts 不动', r.lastReview === '2020-01-01' && r.dd === 3 && r.ts === 1, JSON.stringify({ lr: r.lastReview, dd: r.dd, ts: r.ts }));
    ok('③12 resetEpoch +1（让降级能跨设备传播）', r.epoch === 5, 'resetEpoch=' + r.epoch);
    await ctx.close();
  }

  /* ④ 自动整理：预置重复词 → 进页面就被合并掉，且保留练得最久的那条 */
  {
    const seed = JSON.stringify({
      words: [
        { id: 'a1', en: 'lucid', cn: '清晰易懂的', pos: 'adj.', ipa: '/ˈluːsɪd/', level: 5, dh: 30,
          nextReview: '2020-01-01', errTotal: 0, hist: [], hardWord: false, keyWord: true, ts: 100, dd: 3 },
        { id: 'a2', en: 'Lucid', cn: '', pos: '', ipa: '', level: 0, dh: 0,
          nextReview: '2020-01-01', errTotal: 0, hist: [], hardWord: true, keyWord: false, ts: 200, dd: 0 },
        { id: 'b1', en: 'quaint', cn: '古雅的', pos: 'adj.', ipa: '/kweɪnt/', level: 2, dh: 4,
          nextReview: '2020-01-01', errTotal: 0, hist: [], hardWord: false, keyWord: false, ts: 300, dd: 3 }
      ],
      settings: {}, plans: [], checkins: []
    });
    const { ctx, p, errs } = await boot(b, { token: true, seed });
    const r = await p.evaluate(() => ({
      total: (DATA.words || []).length,
      lucids: (DATA.words || []).filter(w => String(w.en || '').toLowerCase() === 'lucid').length,
      kept: (function () {
        const w = (DATA.words || []).find(x => String(x.en || '').toLowerCase() === 'lucid');
        return w ? { id: w.id, level: w.level, keyWord: w.keyWord, hardWord: w.hardWord } : null;
      })(),
    }));
    ok('④1 重复的 lucid 两条被自动合并成一条', r.lucids === 1, 'lucids=' + r.lucids + ' total=' + r.total);
    ok('④2 总词数 3 → 2', r.total === 2, 'total=' + r.total);
    ok('④3 保留「练得最久」那条（level 5 > 0 → 留 a1）', r.kept && r.kept.id === 'a1', JSON.stringify(r.kept));
    ok('④4 被删那条的难词标注并入保留项', r.kept && r.kept.hardWord === true, JSON.stringify(r.kept));
    ok('④5 保留项原有的重点标注不丢', r.kept && r.kept.keyWord === true, JSON.stringify(r.kept));
    ok('④6 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ⑤ 已登录时导入走 AI 两阶段 = 落库即完全体（cn + pos + ipa 齐全） */
  {
    const { ctx, p, errs } = await boot(b, { token: true });
    await p.click('[data-wtab="bank"]');   // 默认停在「学习」tab，先切到词库
    await sleep(600);
    await p.click('#wlImpBar');        // 导入区是 44px 折叠条，先展开
    await sleep(400);
    await p.fill('#smartInput', 'lucid  清晰的\nquaint');
    await p.click('#smartImport');
    await sleep(2500);
    const r = await p.evaluate(() => {
      const list = (DATA.words || []);
      const w = list.find(x => String(x.en || '').toLowerCase() === 'apple');
      return { total: list.length, w: w ? { cn: w.cn, pos: w.pos, ipa: w.ipa } : null,
               hint: (document.getElementById('importHint') || {}).textContent || '' };
    });
    ok('⑤1 导入后词条带完整释义/词性/音标（完全体）',
       !!r.w && !!r.w.cn && !!r.w.pos && !!r.w.ipa, JSON.stringify(r.w));
    ok('⑤2 提示语不再出现「AI 补全」按钮字样', r.hint.indexOf('AI 补全') < 0, JSON.stringify(r.hint));
    ok('⑤3 页面无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n—— 降级 + 去按钮 ——  ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
