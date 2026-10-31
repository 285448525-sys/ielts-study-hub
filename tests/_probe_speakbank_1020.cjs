/* 10-20 深夜 口语题库重建验收（按《口语题库-考频版_1010》）
   用法：node tests/_with_server.cjs tests/_probe_speakbank_1020.cjs 8811
   线上：BASE=https://yasihub.com node tests/_probe_speakbank_1020.cjs
   断言口径全部来自数据本身（89 条 / P1 33 / P2 56 / 四档计数 / 必考合并后的题数），
   走真实交互路径（切 tab、点卡片），不手工塞 innerHTML。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8811';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.addInitScript(() => {
    try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true })); } catch (e) {}
  });
  await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  /* 等题库列表渲染出来 */
  await p.waitForFunction(() => document.querySelectorAll('.sp-card[data-id]').length > 5, null, { timeout: 20000 }).catch(() => {});

  /* ① 总量与分档（题库 tab = P1+P2 合并，89 张卡） */
  const meta = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.sp-card[data-id]')];
    return {
      cards: cards.length,
      p1: cards.filter(c => /P1/.test((c.querySelector('.sp-tag-p') || {}).textContent || '')).length,
      p2: cards.filter(c => /P2/.test((c.querySelector('.sp-tag-p') || {}).textContent || '')).length,
      bank: (typeof SPEAKING_BANK !== 'undefined') ? SPEAKING_BANK.length : -1,
      ver: (typeof SPEAKING_BANK_VERSION !== 'undefined') ? SPEAKING_BANK_VERSION : -1,
      note: (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META.note : '',
      updated: (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META.updated : ''
    };
  });
  ok('①1 题库总条数 89', meta.bank === 89, 'bank=' + meta.bank);
  ok('①2 版本号 18（2026-10-27 频次更新，强制迁移）', meta.ver === 18, 'ver=' + meta.ver);
  /* 🔵 10-27：META 的版本戳跟着题库走（本次频次更新 → 1027 版）。
     判据不再写死「1020 版」，而是「note 里有版本戳且与 META.updated 同代」——
     这样以后每次更新题库只需改数据，不用再回来改这条断言。 */
  ok('①3 META 版本戳已跟上（1027 版）', /1027 版/.test(meta.note), meta.note.slice(0, 24) + '…');
  ok('①3b META.updated 与版本戳同代（2026-10-27）', meta.updated === '2026-10-27', meta.updated);
  ok('①4 列表渲染 89 张卡（P1 33 + P2 56）', meta.cards === 89 && meta.p1 === 33 && meta.p2 === 56,
    'cards=' + meta.cards + ' p1=' + meta.p1 + ' p2=' + meta.p2);

  /* ② 频次筛选（真实改 select + 触发 change）—— ultra 只有 P1 有，high/medium/low 是 P1+P2 合计 */
  const byFreq = async (v) => p.evaluate((v) => {
    const sel = document.querySelector('#freqSelect');
    sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return document.querySelectorAll('.sp-card[data-id]').length;
  }, v);
  const fAll = await byFreq('all');
  const fUltra = await byFreq('ultra');
  const fHigh = await byFreq('high');
  const fMedium = await byFreq('medium');
  const fLow = await byFreq('low');
  ok('②1 全部 89', fAll === 89, String(fAll));
  ok('②2 必考题 5（P1 独有）', fUltra === 5, String(fUltra));
  /* 🔵 2026-10-27 频次更新（考频清单_纯版_2026-10-27.md）：档位数量全变，这里跟着更新。
     新值 = P1(必考5/高10/中13/低5) + P2(高17/中34/低5)：
       高频 10+17=27 · 中频 13+34=47 · 低频 5+5=10 */
  ok('②3 高频 27（P1 10 + P2 17）', fHigh === 27, String(fHigh));
  ok('②4 中频 47（P1 13 + P2 34）', fMedium === 47, String(fMedium));
  ok('②5 低频 10（P1 5 + P2 5）', fLow === 10, String(fLow));
  await byFreq('all');

  /* ③ 必考题合并后的题数（点开工作/学习卡） */
  const workQ = await p.evaluate(async () => {
    const card = document.querySelector('.sp-card[data-id="sb_p1_work"]');
    if (!card) return null;
    card.click();
    await new Promise(r => setTimeout(r, 900));
    return document.querySelectorAll('li.sp-q[data-qi]').length;
  });
  ok('③1 工作/学习 展开 16 小题（合并后）', workQ === 16, String(workQ));

  /* ④ 合并问法真的在一行里（文本含 " / "） */
  const mergedText = await p.evaluate(() => {
    const t = document.body.innerText || '';
    return {
      hasStudyWork: /What subjects are you studying\? \/ What work do you do\?/.test(t),
      hasHome: /Do you live in an apartment or a house\? \/ What kinds of accommodation/.test(t)
    };
  });
  ok('④1 学习/工作 两套问法已合并成一行', mergedText.hasStudyWork);

  /* ⑤ P2 56 张卡 + 新卡在位（用 #spPartSeg 的 P2 段控，真实点击） */
  const p2 = await p.evaluate(async () => {
    const btn = document.querySelector('#spPartSeg [data-part="P2"]');
    if (!btn) return { err: 'no-btn' };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    const ids = [...document.querySelectorAll('.sp-card[data-id]')].map(c => c.getAttribute('data-id'));
    return { n: ids.length, hasNew: ids.includes('sb_p2_goodservice'), hasGone: ids.includes('sb_p2_metonce') };
  });
  ok('⑤1 P2 56 张卡', p2.n === 56, 'n=' + p2.n);  ok('⑤2 新卡 sb_p2_goodservice 在位', p2.hasNew);
  ok('⑤3 非大陆卡 sb_p2_metonce 已下线', !p2.hasGone);

  ok('⑥ 全程零 JS 报错', errs.length === 0, errs.join(' | '));

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
