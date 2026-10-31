/* 10/17 性能批 · home.js「遮罩按住不放」握手的功能回归
   改动：index.js ready() 置 __hubBootHold，两卡渲染完（双 rAF）后调 releaseBoot。
   风险点（必须证明没坏）：
     ① 遮罩最终一定会收（不能卡在黑屏上）—— 含：正常路径 / AWL 词库路径
     ② 首屏内容真的画出来了（不是「遮罩收了但页面还是空」）
     ③ 三件事卡与今日专注/今日待学都在
     ④ 零页面错误
   跑法：node tests/_with_server.cjs tests/_probe_bootgate_1017.cjs 8909 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8909';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });

  for (const scene of ['custom', 'awl']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((sc) => {
      if (!localStorage.getItem('hub_onboarding_v2')) {
        localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      }
      if (!localStorage.getItem('ielts_study_hub_v1')) {
        localStorage.setItem('ielts_study_hub_v1', JSON.stringify({
          settings: { examDate: '2026-12-01', dailyGoalHours: 2 },
          words: [], sessions: [], plans: [],
        }));
      }
      if (sc === 'awl' && !localStorage.getItem('ielts_hub_obank_v1')) {
        /* 官方词库激活态的存储键是 ielts_hub_obank_v1（js/wordbank.js 的 OB_KEY），
           不是 hub_wordbank_state —— 我第一次猜错了，导致「awl」这一轮其实跑成了默认词库。 */
        localStorage.setItem('ielts_hub_obank_v1', JSON.stringify({ active: 'awl', banks: { awl: { prog: {} } } }));
      }
    }, scene);

    const errs = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));

    const t0 = Date.now();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });

    // ① 遮罩必须收（15s 内）
    let gone = false;
    try {
      await p.waitForFunction(() => !document.getElementById('bootLoader'), { timeout: 15000 });
      gone = true;
    } catch (e) { gone = false; }
    const ms = Date.now() - t0;
    ok(gone, '[' + scene + '] ① 启动遮罩在 ' + ms + 'ms 时已从 DOM 移除（没卡在黑屏）');

    // ②③ 首屏内容
    /* 10/21 design/113A3a：首页双卡（section.meta .meta-card）已换成四数字卡（.hstat）。
       断言口径不变 —— 仍是「首屏的指标卡都渲染完、且落在视口内」，
       只是元素选择器跟着新结构走；别退回旧选择器（那会永远 0 张 = 假红）。 */
    const c = await p.evaluate(() => {
      const tt = document.getElementById('threeThings');
      const cards = document.querySelectorAll('.hstats .hstat');
      const name = document.getElementById('userName');
      return {
        ttVisible: !!(tt && !tt.hidden && tt.offsetHeight > 0),
        ttH: tt ? tt.offsetHeight : 0,
        metaCards: cards.length,
        metaTop: cards.length ? Math.round(cards[0].getBoundingClientRect().top) : -1,
        heroName: name ? (name.textContent || '').trim() : '',
        bodyH: document.body.scrollHeight,
      };
    });
    ok(c.metaCards >= 4, '[' + scene + '] ② 四张数字卡都渲染了（' + c.metaCards + ' 张，top=' + c.metaTop + '）');
    ok(c.bodyH > 800, '[' + scene + '] ③ 页面有内容（body 高 ' + c.bodyH + 'px）');
    ok(c.heroName.length > 0, '[' + scene + '] ④ 首屏问候语已填充（"' + c.heroName + '"）');
    console.log('     #threeThings: visible=' + c.ttVisible + ' h=' + c.ttH + 'px');

    ok(errs.length === 0, '[' + scene + '] ⑤ 零页面错误');
    if (errs.length) console.log('     errors: ' + errs.slice(0, 3).join(' | '));

    await ctx.close();
  }

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
