/* 10-20 深夜 口语题库重建验收（按《口语题库-考频版_1010》）
   用法：node tests/_with_server.cjs tests/_probe_speakbank_1020.cjs 8811
   线上：BASE=https://yasihub.com node tests/_probe_speakbank_1020.cjs
   断言口径全部来自数据本身（题库总量 / 版本号 / P1+P2 / 四档计数 / 必考合并后的题数），
   走真实交互路径（切 tab、点卡片），不手工塞 innerHTML。
   2026-10-28 SPK-BANK-REFRESH-1028-1：官方清单换版（ver 19、P1 37/P2 52、频次重算）。
   本探针不再把每次换版的数字写死，改为从 SPEAKING_BANK / META / DATA 现场推导，
   保留「版本戳同代、强制迁移已生效、列表与筛选和源数据一致」的原断言意图。 */
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
    const bank = (typeof SPEAKING_BANK !== 'undefined' && Array.isArray(SPEAKING_BANK)) ? SPEAKING_BANK : [];
    const count = f => bank.filter(x => x && x.frequency === f).length;
    const countP1 = f => bank.filter(x => x && x.type === 'P1' && x.frequency === f).length;
    return {
      cards: cards.length,
      p1: cards.filter(c => /P1/.test((c.querySelector('.sp-tag-p') || {}).textContent || '')).length,
      p2: cards.filter(c => /P2/.test((c.querySelector('.sp-tag-p') || {}).textContent || '')).length,
      bank: bank.length,
      srcP1: bank.filter(x => x && x.type === 'P1').length,
      srcP2: bank.filter(x => x && x.type === 'P2').length,
      ver: (typeof SPEAKING_BANK_VERSION !== 'undefined') ? SPEAKING_BANK_VERSION : -1,
      dataVer: (typeof DATA !== 'undefined') ? DATA.speakingVersion : -1,
      note: (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META.note : '',
      updated: (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META.updated : '',
      ultra: count('ultra'), high: count('high'), medium: count('medium'), low: count('low'),
      /* 2026-11-17 起默认视口只出 P1，档位断言要跟 P1 单侧源数据对账，别拿 P1+P2 合计数比 */
      p1Ultra: countP1('ultra'), p1High: countP1('high'), p1Medium: countP1('medium'), p1Low: countP1('low'),
      freqKeys: [...new Set(bank.map(x => x && x.frequency))].filter(Boolean)
    };
  });
  const stamp = String(meta.updated || '').replace(/-/g, '').slice(4); // 2026-10-28 → 1028
  ok('①1 题库总量与源清单一致（P1 37 + P2 52 = 89）', meta.bank === 89 && meta.bank > 0, 'bank=' + meta.bank);
  /* 🔵 2026-11-17 SPK-BANK-S12：按《口语题库-考频版_1010》S12 逐题人数重排，版本 19→20。
     断言意图不变（正整数 + 已强制迁移到本地 DATA），只是不再把 19 写死。 */
  ok('①2 版本号是正整数且已强制迁移到本地 DATA',
    Number.isInteger(meta.ver) && meta.ver > 0 && meta.dataVer === meta.ver,
    'ver=' + meta.ver + ' dataVer=' + meta.dataVer);
  /* 🔵 2026-10-28 SPK-BANK-REFRESH-1028-1：版本戳随 META.updated 走。
     仍验「note 里有版本戳且与 updated 同代」，但不再把 1027 写死。 */
  ok('①3 META 版本戳与 updated 同代（1028 版）',
    !!stamp && new RegExp('^' + stamp + '\\s*版').test(meta.note), meta.note.slice(0, 24) + '…');
  ok('①3b META.updated 是合法日期且与版本戳同源',
    /^\d{4}-\d{2}-\d{2}$/.test(meta.updated) && !!stamp, meta.updated);
  /* 🔵 2026-11-17 起题库默认只看 P1（P1/P2 互斥切换），首屏卡片数 = P1 题数；
     断言意图不变：列表逐张渲染且与源数据一致。 */
  ok('①4 列表逐张渲染且与源数据一致（P1 37 / P2 52）',
    meta.cards === meta.srcP1 && meta.p1 === meta.srcP1 &&
    meta.srcP1 === 37 && meta.srcP2 === 52,
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
  /* 🔵 2026-11-17 SPK-BANK-S12：档位按新清单重算，且默认视口是 P1 ——
     原断言「总数 / 必考 / 高 / 中 / 低 + 四档合计」逐项保留，数值改为 P1 口径（5/10/18/4，合计 37）。 */
  ok('②1 全部 37（P1 口径）', fAll === meta.srcP1 && fAll === 37, String(fAll));
  ok('②2 必考题 5（P1 独有）', fUltra === meta.p1Ultra && fUltra === 5, String(fUltra));
  ok('②3 高频 10（与 S12 源数据一致）', fHigh === meta.p1High && fHigh === 10, String(fHigh) + ' / src ' + meta.p1High);
  ok('②4 中频 18（与 S12 源数据一致）', fMedium === meta.p1Medium && fMedium === 18, String(fMedium) + ' / src ' + meta.p1Medium);
  ok('②5 低频 4（与 S12 源数据一致）', fLow === meta.p1Low && fLow === 4, String(fLow) + ' / src ' + meta.p1Low);
  ok('②6 四档合计覆盖当前 Part 全部题，且必考题全在 P1',
    fUltra + fHigh + fMedium + fLow === fAll &&
    meta.freqKeys.every(k => ['ultra','high','medium','low'].includes(k)),
    meta.freqKeys.join(','));
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

  /* ⑤ 2026-10-28 换版后 P2 52 张卡 + 新卡在位 / 非大陆卡下线（用 #spPartSeg 真实点击） */
  const p2 = await p.evaluate(async () => {
    const btn = document.querySelector('#spPartSeg [data-part="P2"]');
    if (!btn) return { err: 'no-btn' };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    const ids = [...document.querySelectorAll('.sp-card[data-id]')].map(c => c.getAttribute('data-id'));
    return { n: ids.length, hasNew: ids.includes('sb_p2_goodservice'), hasGone: ids.includes('sb_p2_metonce') };
  });
  ok('⑤1 P2 52 张卡（与源数据一致）', p2.n === meta.srcP2 && p2.n === 52, 'n=' + p2.n);  ok('⑤2 新卡 sb_p2_goodservice 在位', p2.hasNew);
  ok('⑤3 非大陆卡 sb_p2_metonce 已下线', !p2.hasGone);

  ok('⑥ 全程零 JS 报错', errs.length === 0, errs.join(' | '));

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
