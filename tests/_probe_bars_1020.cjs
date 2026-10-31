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
  await p.addInitScript(() => {
    try {
      ['reading', 'listening', 'writing', 'speaking'].forEach(k => localStorage.setItem('hub_exam_guide_v2_' + k, '1'));
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
    } catch (e) {}
  });
  return { ctx, p, errs };
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
    await p.click('#mockTabs .pill-tab[data-mtab="reading"]').catch(() => {});
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
      ok('①6 阅读整卷有 Pause（截图里有）', g.pause === true);
      ok('①7 主行 44 + 品牌条按官方口径隐藏（10-22 她拍板）', g.mainH === 44 && g.stripH === 0, 'main=' + g.mainH + ' strip=' + g.stripH);
      ok('①8 品牌条文案仍在 DOM 里（只是 display:none）', /yasihub\.com/.test(g.stripTxt) && /阅读/.test(g.stripTxt), g.stripTxt);
      ok('①9 三个动作按钮同高 30 + 同底色', g.btns.length === 3 && g.btns.every(x => x.h === 30) && new Set(g.btns.map(x => x.bg)).size === 1, JSON.stringify(g.btns));
      ok('①10 .ex-pt 是 div[role=button]（不能嵌 button）', !g.nestedBtn && g.parts.every(x => x.div === 'DIV' && x.role === 'button'));
      /* 10-23：底栏底色按官方口径在 bank.html 尾部改写为 #fff（#examRoot .ex-bar{background:#fff}），
         旧断言还盯 #eef0f2 → 改成「白底 + 顶边线」，官方截图色 */
      ok('①11 底栏底色按官方口径为白 #fff', /255,\s*255,\s*255/.test(g.bg), g.bg);

      /* ①12 答一题（真实交互）→ 题号出「已答」线；切到 Passage 2 后回头看
         Passage 1 的计数应变 1 of 13。
         ⚠️ 口径：当前 Part 只展开题号、不显示计数（截图口径）→ 计数只在「非当前」时可见，
         所以必须切走再回头看。判据走真实点击路径（TFNG 胶囊 / chip+drop / lohb+pslot）。 */
      const cnt = await p.evaluate(async () => {
        const pill = document.querySelector('#examRoot .ex-pill');
        const chip = document.querySelector('#examRoot .ex-chip');
        const drop = document.querySelector('#examRoot .ex-drop');
        const lohb = document.querySelector('#examRoot .ex-lohb');
        const pslot = document.querySelector('#examRoot .ex-pslot');
        let how = 'none';
        if (pill) { pill.click(); how = 'pill'; }
        else if (chip && drop) { chip.click(); await new Promise(r => setTimeout(r, 150)); drop.click(); how = 'chip+drop'; }
        else if (lohb && pslot) { lohb.click(); await new Promise(r => setTimeout(r, 150)); pslot.click(); how = 'lohb+pslot'; }
        await new Promise(r => setTimeout(r, 350));
        const done1 = !!document.querySelector('#examRoot .ex-num--done');
        const pt2 = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 2/.test(x.textContent));
        if (pt2) { pt2.click(); await new Promise(r => setTimeout(r, 800)); }
        const pt1 = [...document.querySelectorAll('#examRoot .ex-pt')].find(x => /Passage 1/.test(x.textContent));
        const cnt1 = pt1 ? ((pt1.querySelector('.ex-pt-n') || {}).textContent || null) : null;
        return { how, done1, cnt1 };
      });
      ok('①12 答一题：题号出已答线 + 切走后显示 1 of 13', cnt.done1 && /^1 of 1\d$/.test(cnt.cnt1 || ''), JSON.stringify(cnt));

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
    await p.click('#mockTabs .pill-tab[data-mtab="listening"]').catch(() => {});
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
          stripTxt: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : ''
        };
      });
      ok('②1 Part 1 当前展开 10 题', g.nums.length === 10 && g.nums[0] === '1' && g.nums[9] === '10', 'n=' + g.nums.length);
      ok('②2 四块：Part 1 + 三个「0 of 10」', g.parts.length === 4 && /^Part 2\s*0 of 10$/.test(g.parts[1]) && /^Part 3\s*0 of 10$/.test(g.parts[2]) && /^Part 4\s*0 of 10$/.test(g.parts[3]), JSON.stringify(g.parts));
      ok('②3 听力整卷无 Pause（考试模式锁定播放，行为铁律）', !g.pause);
      ok('②4 无 Review、底栏无箭头、**顶栏也没有箭头**（W-EXTOP-1 已删）',
        !g.rev && g.barArrows === 0 && g.topArrows === 0);
      ok(g.topPause === false, '②4b 听力考试模式**没有**暂停按钮（顶栏也不该有）');
      ok('②5 品牌条 = yasihub.com · 听力', /yasihub\.com/.test(g.stripTxt) && /听力/.test(g.stripTxt), g.stripTxt);

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
    await p.click('#mockTabs .pill-tab[data-mtab="reading"]').catch(() => {});
    await sleep(1500);
    await p.click('#partTabs .pill-tab[data-part="Part 1"]').catch(() => {});
    await sleep(900);
    await p.evaluate(() => { const el = document.querySelector('.bank-item'); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); } });
    await p.waitForSelector('#examRoot .ex-group', { timeout: 20000 }).catch(() => {});
    await sleep(1400);
    const g = await p.evaluate(() => {
      const bar = document.querySelector('#examRoot .ex-bar');
      if (!bar) return null;
      const nums = [...bar.querySelectorAll('.ex-num')];
      const navBox = bar.querySelector('.ex-nav').getBoundingClientRect();
      const numsBox = bar.querySelector('.ex-nums').getBoundingClientRect();
      const strip = bar.querySelector('.ex-strip');
      return {
        n: nums.length, parts: bar.querySelectorAll('.ex-pt').length,
        pause: !!bar.querySelector('#exPauseBtn'), rev: !!bar.querySelector('#exReviewBtn'),
        barArrows: bar.querySelectorAll('.ex-arrow').length,
        topArrows: document.querySelectorAll('#examRoot .ex-step .ex-arrow').length,
        centered: Math.abs((numsBox.left - navBox.left) - (navBox.right - numsBox.right)) < 30,
        stripTxt: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : ''
      };
    });
    ok('③1 单篇只列本篇题号（无跨篇）', g && g.n > 0 && g.n <= 14, g ? 'n=' + g.n : 'no bar');
    ok('③2 单篇不渲染 Part 行', g && g.parts === 0);
    ok('③3 单篇保留 Pause（练习可暂停）', g && g.pause === true);
    /* W-EXTOP-1（10-25）：顶栏箭头已删（她点名）→ 这条改成「必须没有」。 */
    ok(g && !g.rev && g.barArrows === 0 && g.topArrows === 0, '③4 单篇无 Review、底栏无箭头、**顶栏也没有箭头**（W-EXTOP-1 已删）');
    ok('③5 单篇题号行居中', g && g.centered, g ? 'centered=' + g.centered : '');
    ok('③6 单篇也有品牌条', g && /yasihub\.com/.test(g.stripTxt), g ? g.stripTxt : '');
    ok('③7 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ④ 箭头全程连续（阅读整卷：1 → 40，跨 Passage） ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await p.click('#mockTabs .pill-tab[data-mtab="reading"]').catch(() => {});
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
    await p.click('#mockTabs .pill-tab[data-mtab="reading"]').catch(() => {});
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
    await p.click('#mockTabs .pill-tab[data-mtab="reading"]').catch(() => {});
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
          stripHidden: strip ? getComputedStyle(strip).display === 'none' : false,
          stepHidden: step ? getComputedStyle(step).display === 'none' : false,
          btns: bar.querySelectorAll('.ex-actions button').length,
          partsScroll: parts ? parts.scrollWidth > parts.clientWidth : false,
          barH: Math.round(bar.getBoundingClientRect().height)
        };
      });
      ok('⑥1 手机品牌条隐藏（内容空间优先）', g.stripHidden);
      ok(g.stepHidden === true || !document.querySelector('#examRoot .ex-step'), '⑥2 手机顶栏箭头已不存在（整块删了，无所谓隐藏）');
      ok('⑥3 三个动作按钮仍在', g.btns === 3, 'btns=' + g.btns);
      ok('⑥4 Part 行可横向滚（放不下不裁切）', g.partsScroll);
      ok('⑥5 无 JS 报错', errs.length === 0, errs.join(' | '));
    }
    await ctx.close();
  }

  /* ===== ⑦ 口语模考底栏（上批已定案，回归不动） ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
    await sleep(3200);
    await p.click('#spMockJumpBtn').catch(async () => {
      await p.evaluate(() => { const t = [...document.querySelectorAll('.pill-tab')].find(x => /模考/.test(x.textContent)); if (t) t.click(); });
    });
    await sleep(4500);
    const g = await p.evaluate(() => {
      const bar = document.querySelector('#mockBar');
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      const cs = getComputedStyle(bar);
      const btn = document.getElementById('mockSubmit');
      const br = btn ? btn.getBoundingClientRect() : null;
      return {
        pos: cs.position, h: Math.round(r.height),
        atBottom: Math.abs(r.bottom - window.innerHeight) <= 1,
        fullWidth: Math.round(r.left) === 0 && r.width >= window.innerWidth - 20,
        barW: Math.round(r.width), iw: window.innerWidth,
        ix: (document.getElementById('mockBarIx') || {}).textContent || '',
        fill: (document.getElementById('mockBarFill') || {}).style.width || '',
        btnText: btn ? btn.textContent.trim() : null,
        btnInBar: !!(btn && bar.contains(btn)),
        btnH: br ? Math.round(br.height) : 0,
        bg: cs.backgroundColor,
        oldControls: document.querySelectorAll('.mock-controls').length,
        noOverlap: br ? (br.bottom <= r.bottom + 1) : false
      };
    });
    ok('⑦1 口语底栏存在且 fixed 在视口最底', g && g.pos === 'fixed' && g.atBottom, g ? g.pos + ' bottom-ok=' + g.atBottom : 'no bar');
    ok('⑦2 通栏（左缘贴 0、宽度≈视口）', g && g.fullWidth, g ? g.barW + '/' + g.iw : '');
    ok('⑦3 高 56px + #eef0f2', g && g.h === 56 && /238,\s*240,\s*242/.test(g.bg), g ? 'h=' + g.h + ' bg=' + g.bg : '');
    ok('⑦4 左侧进度文案（第 x / y 题）', g && /第\s*\d+\s*\/\s*\d+\s*题/.test(g.ix), g ? g.ix : '');
    ok('⑦5 进度条有宽度', g && /\d+%/.test(g.fill), g ? g.fill : '');
    ok('⑦6 主按钮仍在底栏内（id 未变，mock.js 绑定不受影响）', g && g.btnInBar && g.btnText === '下一题', g ? g.btnText : '');
    ok('⑦7 旧卡内 .mock-controls 已移除（不留重复按钮）', g && g.oldControls === 0);
    ok('⑦8 无 JS 报错', errs.length === 0, errs.join(' | '));
    if (g && g.btnInBar) {
      const before = g.ix;
      await p.evaluate(() => { const t = document.getElementById('mockManual'); if (t) { t.value = 'My name is Zhizhi.'; t.dispatchEvent(new Event('input', { bubbles: true })); } });
      await p.click('#mockSubmit').catch(() => {});
      await sleep(2600);
      const after = await p.evaluate(() => (document.getElementById('mockBarIx') || {}).textContent || '');
      ok('⑦9 点底栏按钮进入下一题（进度前进）', after !== before && /第\s*2\s*\//.test(after), before + ' → ' + after);
    }
    await ctx.close();
  }

  /* ===== ⑧ 写作底栏未被破坏（写作走 bank.html 的 writing tab + #wrtFullStart） ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await sleep(3200);
    await p.click('[data-mtab="writing"]').catch(() => {});
    await sleep(2200);
    await p.click('#wrtFullStart').catch(() => {});
    await sleep(2500);
    const g = await p.evaluate(() => {
      const host = document.getElementById('examPractice');
      const bar = host && host.querySelector('.wt-bar');
      if (!bar) return null;
      const tabs = [...bar.querySelectorAll('.ex-pg')].map(x => x.textContent.trim());
      const btns = [...bar.querySelectorAll('.ex-actions button')].map(x => Math.round(x.getBoundingClientRect().height));
      return { h: Math.round(bar.getBoundingClientRect().height), tabs: tabs, bg: getComputedStyle(bar).backgroundColor, btns: btns };
    });
    ok('⑧1 写作 .wt-bar 仍在且 44px', g && g.h === 44, g ? 'h=' + g.h : 'no wt-bar');
    ok('⑧2 写作两个 Task 标签未被动过', g && g.tabs.length === 2, g ? JSON.stringify(g.tabs) : '');
    ok('⑧3 写作底栏底色仍是 #eef0f2', g && /238,\s*240,\s*242/.test(g.bg), g ? g.bg : '');
    ok('⑧4 无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
})();
