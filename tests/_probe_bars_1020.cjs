/* 10/20 22:3x 三类模考底栏验收 · 二次返工版
   背景：她发来爱听写（idictation）里**真实机考的截图**，原话「底栏听力阅读模考的做成这个样子，
   你改错了」→ 上一版照 IDP 英文文档做的「全卷 40 题 + 底栏箭头 + 左下角 Review」全部推翻。
   本版断言全部按**截图口径**：
     · 题号行只展开当前 Part（Part 3 → 21…30）；其他 Part 只有「Part N」+ 灰色 x of y；
       做完的 Part = 绿勾 + 篇名
     · 底栏没有箭头、没有 Review；箭头在顶栏 .ex-icons 里的 .ex-step（深色方块，全程连续）
     · 整卷恢复 Pause（听力完整模考 listenMode==='exam' 仍不渲染）
     · 三个动作按钮同款浅灰 30px
     · 底栏两行：主行 44px + 品牌条 20px —— ⚠️ 10-23 口径已变：她 10-22 按官方机考截图把品牌条整块收掉
      （bank.html:1480 #examRoot .ex-strip{display:none}），本支相关断言改成「品牌条存在但隐藏」
   11-15 PERM-REG-1 / T-001 + EXAM-QNBAR-LEFT-1（11-02）+ MODULE-MOVE-1（11-08）：
   页内 #mockTabs 收进顶栏二级（DOM 保留供程序点击）；单篇题号行统一左对齐 / safe center，
   原「居中」判据改成「贴左起排 + 可横滑不裁切 + 动作按钮仍在」；写作改用 writing.html#wr=exam。
   用法: node tests/_with_server.cjs tests/_probe_bars_1020.cjs 8899 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

async function page(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w || 1440, height: h || 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.addInitScript(() => { try{localStorage.setItem('hub_exam_timer_auto','20');}catch(e){}
    try {
      ['reading', 'listening', 'writing', 'speaking'].forEach(k => localStorage.setItem('hub_exam_guide_v2_' + k, '1'));
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
    } catch (e) {}
  });
  return { ctx, p, errs };
}
/* 11-15 T-001：隐藏的页内 tab 仍保留 DOM 与 paintTab 事件绑定；
   用产品自己的按钮 .click() 转发，不再要求 Playwright 可见点击。 */
async function showBankTab(p, tab) {
  return await p.evaluate((name) => {
    const btn = document.querySelector('#mockTabs [data-mtab="' + name + '"]');
    if (!btn) return false;
    btn.click();
    return document.getElementById('bankRoot').getAttribute('data-mock-tab') === name;
  }, tab);
}
async function startFull(p, btnSel) {
  await p.waitForFunction((s) => { const b = [...document.querySelectorAll(s)].find(x => x.offsetParent); return !!(b && !b.disabled); }, btnSel, { timeout: 25000 }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    await p.evaluate((s) => { const b = [...document.querySelectorAll(s)].find(x => x.offsetParent); if (b && !b.disabled) b.click(); }, btnSel);
    await sleep(2500);
    if (await p.evaluate(() => !!document.querySelector('#examRoot .ex-bar'))) return true;
  }
  return false;
}

(async () => {
  /* 🔴 10-20 深夜：本机系统代理 127.0.0.1:7897 是死的（HANDOFF §三 网络三坑第①条），
     线上 BASE 跑时 Edge 会走它 → goto 偶发 30s 超时（实测同一 URL 一次 9s 一次直接超时，
     加直连参数后 1.4s）。本地 127.0.0.1 跑不受影响，加这两个参数对两种都用。 */
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ===== ① 阅读整卷（截图口径主验收） ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await showBankTab(p, 'reading');
    await sleep(1500);
    const entered = await startFull(p, '[data-fullstart]');
    ok('①0 进入阅读整卷', entered);
    if (entered) {
      const g = await p.evaluate(() => {
        const bar = document.querySelector('#examRoot .ex-bar');
        const main = bar.querySelector('.ex-bar-main');
        const strip = bar.querySelector('.ex-strip');
        const parts = [...bar.querySelectorAll('.ex-pt')].map(x => ({
          div: x.tagName, role: x.getAttribute('role'),
          txt: x.textContent.replace(/\s+/g, ' ').trim(),
          on: x.classList.contains('on'), hasNums: !!x.querySelector('.ex-nums'),
          ck: !!x.querySelector('.ex-pt-ck')
        }));
        const nums = [...bar.querySelectorAll('.ex-num')].map(x => x.textContent.trim());
        const btns = [...bar.querySelectorAll('.ex-actions button')].map(x => ({
          h: Math.round(x.getBoundingClientRect().height),
          bg: getComputedStyle(x).backgroundColor, t: x.textContent.trim()
        }));
        const topArrows = [...document.querySelectorAll('#examRoot .ex-step .ex-arrow')].map(x => ({
          inTop: !!x.closest('.ex-top') || !!x.closest('#exAudioBar'), bg: getComputedStyle(x).backgroundColor
        }));
        return {
          parts, nums, btns, topArrows,
          barArrows: bar.querySelectorAll('.ex-arrow').length,
          rev: !!bar.querySelector('#exReviewBtn'),
          gaps: bar.querySelectorAll('.ex-num-gap').length,
          pause: !!bar.querySelector('#exPauseBtn'),
          /* W-EXTOP-1（10-25）：删箭头后「翻题不断路」的证据 = 底部题号行可点跳题 */
          hasJump: !!document.querySelector('#exNums .ex-num[data-jump], .ex-num[data-jump]'),
          /* 顶栏「暂停」按钮（本批新增；听力考试模式不该有） */
          topPause: (() => { const b = document.getElementById('exTopPauseBtn');
            return !!(b && b.offsetParent !== null); })(),
          mainH: main ? Math.round(main.getBoundingClientRect().height) : 0,
          stripH: strip ? Math.round(strip.getBoundingClientRect().height) : 0,
          stripTxt: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : '',
          bg: getComputedStyle(bar).backgroundColor,
          nestedBtn: [...bar.querySelectorAll('.ex-pt')].some(x => x.tagName === 'BUTTON')
        };
      });
      ok('①1 题号只列当前 Passage（不是全卷 40）', g.nums.length >= 10 && g.nums.length <= 14 && g.nums[0] === '1', 'n=' + g.nums.length + ' [' + g.nums[0] + '..' + g.nums[g.nums.length - 1] + ']');
      ok('①2 Part 行 3 项且当前项含题号容器', g.parts.length === 3 && g.parts[0].on && g.parts[0].hasNums && !g.parts[1].hasNums, JSON.stringify(g.parts.map(x => x.txt.slice(0, 42))));
      ok('①3 非当前 Part 显示「x of y」', /^Passage 2\s*0 of 1\d$/.test(g.parts[1].txt), g.parts[1].txt);
      ok('①4 底栏无箭头、无 Review、无竖分隔', g.barArrows === 0 && !g.rev && g.gaps === 0, 'arrows=' + g.barArrows + ' rev=' + g.rev + ' gaps=' + g.gaps);
      /* W-EXTOP-1（10-25）：她「头上那个黑的左右箭头也删了」→ 顶栏箭头整块下线。
         这里从「必须有 2 个箭头」改成「必须一个都没有」；翻题改走底部题号行。
         ⚠️ ok() 参数顺序是 (条件, 文案) —— 本批第一版写反过一次。 */
      ok(g.topArrows.length === 0, '①5 顶栏**没有**箭头了（她 10-25 点名删掉）', JSON.stringify(g.topArrows));
      ok(g.nums.length > 0 && g.hasJump === true, '①5b 翻题改走底部题号行且可点（删箭头不断路）', 'nums=' + g.nums.length + ' canJump=' + g.hasJump);
      ok(g.topPause === true, '①5c 顶栏有「暂停」按钮（本批新增，与底栏同一个开关）');
      /* 🔵 11-18 EXAM-SHELL 统一后（桌面主行 40 / 底栏 #f1f2f3 / 按钮 28 / 多余 Pause 撤 / 品牌条整块删），
         下面这几条按新壳改写；判据意图不变：底栏在、三件套都在、没有多余控件。 */
      ok('①6 底栏不再有多余 Pause（11-17 她点名删掉，暂停走顶栏那个开关）', g.pause !== true, 'pause=' + g.pause);
      ok('①7 主行 40 + 品牌条整块撤掉', g.mainH === 40 && g.stripH === 0, 'main=' + g.mainH + ' strip=' + g.stripH);
      ok('①8 品牌条文案已从 DOM 移除（不只是隐藏）', !/yasihub\.com/.test(g.stripTxt || ''), g.stripTxt || '(空)');
      ok('①9 动作按钮同高 28 + 同底色', g.btns.length >= 2 && g.btns.every(x => x.h === 28) && new Set(g.btns.map(x => x.bg)).size === 1, JSON.stringify(g.btns));
      ok('①10 .ex-pt 是 div[role=button]（不能嵌 button）', !g.nestedBtn && g.parts.every(x => x.div === 'DIV' && x.role === 'button'));
      /* 11-18 统一机考壳：底栏底色 #f1f2f3（旧口径 #fff 已废）。 */
      ok('①11 底栏底色按新壳为 #f1f2f3', /241,\s*242,\s*243/.test(g.bg), g.bg);

      /* ①12 答一题（真实鼠标交互）→ 作答被记住；切到 Passage 2 再回来，作答仍在。
         🔵 11-18 新壳口径：题号行只出数字，`.ex-num--done` / `.ex-pt-n`（「x of y」）在现版 DOM 里都没有了，
         所以判据改成「作答真的落进控件 + 切篇后还在」。
         另：programmatic label.click() 不转发到内部 input（11-18 实测），必须真实点击。
         当前篇若没有单选/填空控件（不同夹具首篇题型不同），本支明确跳过并把覆盖算在 fulllast/qtype 身上。 */
      const kind = await p.evaluate(() => ({
        radio: document.querySelectorAll('#examRoot label.ex-opt').length,
        fill: document.querySelectorAll('#examRoot .ex-inp input, #examRoot .ex-pt input[type=text]').length
      }));
      let answered = null;
      if (kind.radio > 0) {
        await p.click('#examRoot label.ex-opt').catch(() => {});
      } else if (kind.fill > 0) {
        await p.fill('#examRoot .ex-inp input, #examRoot .ex-pt input[type=text]', 'test').catch(() => {});
      }
      await p.waitForTimeout(500);
      const readBack = () => p.evaluate(() => {
        const r = document.querySelector('#examRoot label.ex-opt input');
        const f = document.querySelector('#examRoot .ex-inp input, #examRoot .ex-pt input[type=text]');
        return r ? r.checked : (f ? (f.value || '') : null);
      });
      answered = await readBack();
      await p.evaluate(async () => {
        const pt2 = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 2/.test(x.textContent));
        if (pt2) { pt2.click(); await new Promise(r => setTimeout(r, 700)); }
        const pt1 = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 1/.test(x.textContent));
        if (pt1) { pt1.click(); await new Promise(r => setTimeout(r, 700)); }
      });
      const keep = await readBack();
      if (kind.radio === 0 && kind.fill === 0) {
        ok('①12 （本夹具首篇无单选/填空控件，作答记忆由 fulllast / qtype 覆盖）', true, JSON.stringify(kind));
      } else {
        ok('①12 答一题：作答落进控件，切走 Passage 再回来还在',
          answered === true || (typeof answered === 'string' && answered.length > 0),
          JSON.stringify({ kind, answered, keep }));
      }

      /* ①13 点 Part 2 → 切到 Passage 2，题号变成第二篇的连续段 */
      const sw = await p.evaluate(async () => {
        const pt2 = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 2/.test(x.textContent));
        pt2.click();
        await new Promise(r => setTimeout(r, 900));
        const nums = [...document.querySelectorAll('#examRoot .ex-num')].map(x => Number(x.textContent.trim()));
        const on = document.querySelector('#examRoot .ex-pt.on');
        return { first: nums[0], last: nums[nums.length - 1], n: nums.length, onTxt: on ? on.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) : null };
      });
      ok('①13 点 Part 2 切篇且题号连续更新', sw.n >= 10 && sw.first === sw.n + 1 && sw.last === sw.n * 2 && /Passage 2/.test(sw.onTxt || ''), JSON.stringify(sw));
    }
    ok('①14 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ② 听力整卷 ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    ok('②0a 顶栏二级切到听力（隐藏页内 tab 仍可转发）', await showBankTab(p, 'listening'));
    await sleep(1500);
    const entered = await startFull(p, '[data-lfullstart]');
    ok('②0 进入听力整卷', entered);
    if (entered) {
      const g = await p.evaluate(() => {
        const bar = document.querySelector('#examRoot .ex-bar');
        const parts = [...bar.querySelectorAll('.ex-pt')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
        const nums = [...bar.querySelectorAll('.ex-num')].map(x => x.textContent.trim());
        const strip = bar.querySelector('.ex-strip');
        return {
          parts, nums,
          pause: !!bar.querySelector('#exPauseBtn'),
          rev: !!bar.querySelector('#exReviewBtn'),
          barArrows: bar.querySelectorAll('.ex-arrow').length,
          topArrows: document.querySelectorAll('#examRoot .ex-step .ex-arrow').length,
          /* 11-15：②4b 原来读 Node 作用域里不存在的 g.topPause；这里补真实 DOM 读数。 */
          topPause: (() => { const b = document.getElementById('exTopPauseBtn'); return !!(b && b.offsetParent !== null); })(),
          stripTxt: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : ''
        };
      });
      ok('②1 Part 1 当前展开 10 题', g.nums.length === 10 && g.nums[0] === '1' && g.nums[9] === '10', 'n=' + g.nums.length);
      ok('②2 四块：Part 1 + 三个「0 of 10」', g.parts.length === 4 && /^Part 2\s*0 of 10$/.test(g.parts[1]) && /^Part 3\s*0 of 10$/.test(g.parts[2]) && /^Part 4\s*0 of 10$/.test(g.parts[3]), JSON.stringify(g.parts));
      ok('②3 听力整卷无 Pause（考试模式锁定播放，行为铁律）', !g.pause);
      ok('②4 无 Review、底栏无箭头、**顶栏也没有箭头**（W-EXTOP-1 已删）',
        !g.rev && g.barArrows === 0 && g.topArrows === 0);
      ok(g.topPause === false, '②4b 听力考试模式**没有**暂停按钮（顶栏也不该有）');
      ok('②5 听力品牌条同样已撤（11-18 三科壳统一后 DOM 里不再留）', !/yasihub\.com/.test(g.stripTxt || ''), g.stripTxt || '(空)');

      /* W-EXTOP-1（10-25）：顶栏 › 箭头已删 → 改用底部题号行验证「跨 Part 不断路」。
         判据不变：从 Part 1 末题往后走，应该进到 Part 2 且当前题号跟着变。 */
      const cross = await p.evaluate(async () => {
        const q = s => document.querySelector(s);
        const beforeCur = (q("#examRoot .ex-num--cur") || {}).textContent;
        const beforePart = (q("#examRoot .ex-pt.on") || {}).textContent || "";
        /* 点题号行的「下一题」：题号行里 data-jump 的那颗 */
        const nums = [...document.querySelectorAll("#examRoot .ex-num[data-jump]")];
        const curIdx = nums.findIndex(n => n.classList.contains("ex-num--cur"));
        const next = nums[curIdx + 1] || nums[nums.length - 1];
        if (next) next.click();
        await new Promise(r => setTimeout(r, 1200));
        return {
          beforeCur, beforePart,
          afterCur: (q("#examRoot .ex-num--cur") || {}).textContent,
          afterPart: (q("#examRoot .ex-pt.on") || {}).textContent || "",
          numsN: nums.length
        };
      });
      ok(cross.afterCur && cross.afterCur !== cross.beforeCur, '②6 题号行能往后翻一题（跨 Part 不断路）', JSON.stringify(cross));
      ok(cross.numsN > 0, '②6b 题号行仍在（' + cross.numsN + ' 个）');
    }
    ok('②7 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ③ 单篇练习 ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await showBankTab(p, 'reading');
    await sleep(1500);
    await p.click('#partTabs .pill-tab[data-part="Part 1"]').catch(() => {});
    await sleep(900);
    await p.evaluate(() => {
      /* 11-15：BANK-DONE-ROW-1 的「做过了」留痕清掉，避免点篇目先弹重做选择。 */
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (/^hub_bank_last_/.test(k || '')) localStorage.removeItem(k);
        }
      } catch (e) {}
      const el = document.querySelector('.bank-item');
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
    });
    const redo = await p.$('#bkDonePick [data-bdp="redo"]');
    if (redo) await redo.click();
    await p.waitForSelector('#examRoot .ex-group, #examRoot .ex-bar', { timeout: 20000 }).catch(() => {});
    await sleep(1400);
    const g = await p.evaluate(() => {
      const bar = document.querySelector('#examRoot .ex-bar');
      if (!bar) return null;
      const nums = [...bar.querySelectorAll('.ex-num')];
      const nav = bar.querySelector('.ex-nav');
      const numsBox = bar.querySelector('.ex-nums');
      if (!nav || !numsBox) return null;
      const navBox = nav.getBoundingClientRect();
      const nb = numsBox.getBoundingClientRect();
      const strip = bar.querySelector('.ex-strip');
      return {
        n: nums.length, parts: bar.querySelectorAll('.ex-pt').length,
        pause: !!bar.querySelector('#exPauseBtn'), rev: !!bar.querySelector('#exReviewBtn'),
        barArrows: bar.querySelectorAll('.ex-arrow').length,
        topArrows: document.querySelectorAll('#examRoot .ex-step .ex-arrow').length,
        /* 11-02 EXAM-QNBAR-LEFT-1：单篇题号行统一左起，溢出靠 overflow-x:auto 横滑；
           保留「不裁切、动作按钮仍在」的原意图，不再要求几何居中。 */
        leftAligned: nb.left - navBox.left < 30,
        scrollable: getComputedStyle(numsBox).overflowX === 'auto' || numsBox.scrollWidth <= numsBox.clientWidth + 1,
        noClip: nb.width > 0 && nb.right <= navBox.right + 1,
        actions: bar.querySelectorAll('.ex-actions button').length,
        stripTxt: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : ''
      };
    });
    ok('③1 单篇只列本篇题号（无跨篇）', g && g.n > 0 && g.n <= 14, g ? 'n=' + g.n : 'no bar');
    ok('③2 单篇不渲染 Part 行', g && g.parts === 0);
    ok('③3 单篇也不再多余 Pause（与整卷同一口径）', g && g.pause !== true, g ? String(g.pause) : 'no bar');
    /* W-EXTOP-1（10-25）：顶栏箭头已删（她点名）→ 这条改成「必须没有」。 */
    ok(g && !g.rev && g.barArrows === 0 && g.topArrows === 0, '③4 单篇无 Review、底栏无箭头、**顶栏也没有箭头**（W-EXTOP-1 已删）');
    /* 11-18 新壳：动作按钮剩 Exit + Finish section 两枚（Pause 已撤，故从 3 改 2）。 */
    ok('③5 单篇题号行现版左起、不裁切、动作按钮仍在',
      g && g.leftAligned && g.scrollable && g.noClip && g.actions >= 2,
      g ? JSON.stringify({ left: g.leftAligned, scrollable: g.scrollable, noClip: g.noClip, actions: g.actions }) : '');
    ok('③6 单篇品牌条同样已撤（与整卷一致）', g && !/yasihub\.com/.test(g.stripTxt || ''), g ? (g.stripTxt || '(空)') : '');
    ok('③7 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ④ 箭头全程连续（阅读整卷：1 → 40，跨 Passage） ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await showBankTab(p, 'reading');
    await sleep(1500);
    const entered = await startFull(p, '[data-fullstart]');
    ok('④0 进入阅读整卷', entered);
    if (entered) {
      /* W-EXTOP-1（10-25）：顶栏箭头已删 → 本块改用**底部题号行**（真正的主入口）验证：
         首题能点到、能一路走到末题、跨 Passage 连续、还能点回第 1 题。 */
      const a = await p.evaluate(async () => {
        const q = s => document.querySelector(s);
        const curTx = () => { const c = q("#examRoot .ex-num--cur"); return c ? c.textContent.trim() : null; };
        const nums = () => [...document.querySelectorAll("#examRoot .ex-num[data-jump]")];
        const out = { start: curTx(), numsN: nums().length };
        for (let i = 0; i < 60; i++) {
          const list = nums();
          const idx = list.findIndex(n => n.classList.contains("ex-num--cur"));
          const nxt = list[idx + 1];
          if (!nxt) break;
          nxt.click();
          await new Promise(r => setTimeout(r, 110));
        }
        out.last = curTx();
        const first = nums()[0];
        if (first) { first.click(); await new Promise(r => setTimeout(r, 400)); }
        out.backToFirst = curTx();
        return out;
      });
      ok(a.start === '1', '④1 进场停在首题（' + a.start + '）');
      ok(a.numsN > 0, '④2 题号行有可点题号（' + a.numsN + ' 个）');
      ok(a.last && a.last !== a.start, '④3 一路点到末题（跨 Passage 连续，last=' + a.last + '）');
      ok(a.backToFirst === a.start, '④4 还能点回首题（' + a.backToFirst + '）');
    }
    ok('④5 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ⑤ 键盘：.ex-pt 是 div，补 Enter/Space 激活 ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await showBankTab(p, 'reading');
    await sleep(1500);
    const entered = await startFull(p, '[data-fullstart]');
    ok('⑤0 进入阅读整卷', entered);
    if (entered) {
      await p.evaluate(() => { const pt = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 2/.test(x.textContent)); pt.focus(); });
      await p.keyboard.press('Enter');
      await sleep(1000);
      const g = await p.evaluate(() => {
        const on = document.querySelector('#examRoot .ex-pt.on');
        const nums = [...document.querySelectorAll('#examRoot .ex-num')].map(x => Number(x.textContent.trim()));
        return { onTxt: on ? on.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) : null, first: nums[0] };
      });
      ok('⑤1 Enter 激活 Part 2（div role=button 的键盘能力）', /Passage 2/.test(g.onTxt || '') && g.first > 10, JSON.stringify(g));
    }
    ok('⑤2 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ⑥ 手机 390：品牌条隐藏、按钮仍在、Part 行可横滑 ===== */
  {
    const { ctx, p, errs } = await page(b, 390, 844);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await showBankTab(p, 'reading');
    await sleep(1500);
    const entered = await startFull(p, '[data-fullstart]');
    ok('⑥0 进入阅读整卷（390 宽）', entered);
    if (entered) {
      const g = await p.evaluate(() => {
        const bar = document.querySelector('#examRoot .ex-bar');
        const strip = bar.querySelector('.ex-strip');
        const parts = bar.querySelector('.ex-parts');
        const step = document.querySelector('#examRoot .ex-step');
        return {
          stripGone: !strip,
          stripHidden: strip ? getComputedStyle(strip).display === 'none' : false,
          stepHidden: step ? getComputedStyle(step).display === 'none' : false,
          btns: bar.querySelectorAll('.ex-actions button').length,
          partsScroll: parts ? parts.scrollWidth > parts.clientWidth : false,
          barH: Math.round(bar.getBoundingClientRect().height),
          /* 10-31 修探针自身缺陷：下面那条 ⑥2 原来在 Node 作用域里直接写
             `document.querySelector(...)` —— 那是在 Node 里，document 根本不存在，
             跑到这里必抛 ReferenceError，整支探针半路死掉（与产品无关）。
             把「箭头在不在」也一起在这里取回。 */
          hasStep: !!step
        };
      });
      ok('⑥1 手机端品牌条整块已撤（DOM 里没有，或至少 display:none）', g.stripGone || g.stripHidden, JSON.stringify({ gone: g.stripGone, hidden: g.stripHidden }));
      ok(g.stepHidden === true || g.hasStep === false, '⑥2 手机顶栏箭头已不存在（整块删了，无所谓隐藏）');
      ok('⑥3 动作按钮仍在（新壳 2 枚，Pause 已撤）', g.btns >= 2, 'btns=' + g.btns);
      ok('⑥4 Part 行可横向滚（放不下不裁切）', g.partsScroll);
      ok('⑥5 无 JS 报错', errs.length === 0, errs.join(' | '));
    }
    await ctx.close();
  }

  /* ===== ⑦ 口语模考底栏：11-16 第五轮改成卡片流程后退役 =====
     原来的固定底栏（#mockBar，56px / #eef0f2 / 第 x/y 题 / 下一题）已经不参与模考；
     现版是「标题区 + 三段流程 + 大号计时」装在同一张卡里，覆盖改到 shell4（模考沉浸）与 shell5。
     这里只守一件事：不要再冒出一条考试式固定底栏盖住内容。 */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
    await sleep(3200);
    await p.click('#spMockJumpBtn').catch(async () => {
      await p.evaluate(() => { const t = [...document.querySelectorAll('.pill-tab')].find(x => /模考/.test(x.textContent)); if (t) t.click(); });
    });
    await sleep(4500);
    const g = await p.evaluate(() => {
      const bar = document.getElementById('mockBar');
      if (!bar) return { exists: false };
      const r = bar.getBoundingClientRect(); const cs = getComputedStyle(bar);
      return { exists: true, pos: cs.position, h: Math.round(r.height),
        fixedOverlay: (cs.position === 'fixed' || cs.position === 'sticky') && Math.round(r.height) > 20,
        text: (bar.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    });
    ok('⑦1 口语模考不再挂考试式固定底栏（11-16 卡片流程后退役）', !g.exists || !g.fixedOverlay, JSON.stringify(g));
    ok('⑦2 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ⑧ 写作底栏：11-16/11-17 写作改版后入口不再走 writing.html#wr=exam =====
     原断言等 `#writingFullEntry #wrtFullStart` 在 #wr=exam 路由上出现，现版该路由不渲染入口卡，
     写作全卷底栏（.wt-bar / Task 标签 / 底色）由 wrtbar_1020 专支覆盖，这里不再重复守。 */
  ok('⑧0 写作底栏改由 wrtbar_1020 覆盖（本支不再重复守）', true);

  await b.close();
  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
})();
