/* 10-21 design/113A3a 落地批（她拍板「先做这个」+ 搜索栏用 A3b）：
   ① home.html 首屏 = 顶栏胶囊（8 项）+ A3b 搜索框 + 一行化倒计时 + 四数字卡 + 三件事/今日任务 + 常用模块 + 232px 侧轨；
   ② 其他页仍走侧栏；软导航跨边界（home↔其他页）必须自动换壳；
   ③ 手机端侧轨折成顶部折叠块 + 底栏 dock 保留。
   用法：node tests/_with_server.cjs tests/_probe_homea3a_1021.cjs 8866 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8866';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

const todayKey = (() => { const d = new Date(); const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
const SEED = JSON.stringify({
  settings: { name: 'Camille', examDate: '2026-11-02', dailyGoalHours: 3, practiceCfg: { dailyCap: 40 } },
  sessions: [{ id: 's1', date: todayKey, moduleId: 'vocab', moduleName: '背单词', durationSec: 3600 }],
  words: [{ id: 'w1', en: 'probe', cn: '探针', level: 0, nextReview: todayKey, hardWord: true, dh: 1, cleared: false }],
  plans: [{ date: todayKey, items: [{ id: 'p1', text: '探针任务甲', done: true }, { id: 'p2', text: '探针任务乙', done: false }] }],
  mockRecords: [], wrongbook: [], materials: [], speaking: [], scores: {}, deletedIds: [], revivedIds: []
});

async function boot(b, opts) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(sd => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      localStorage.setItem('ielts_study_hub_v1', sd);
      localStorage.removeItem('hub_auth_token');
    } catch (e) {}
  }, SEED);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
  await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  return { ctx, p, errs };
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  console.log('■ 桌面 1440×900：A3a 首屏骨架');
  {
    const { ctx, p, errs } = await boot(b, { viewport: { width: 1440, height: 900 } });
    const m = await p.evaluate(() => ({
      topbar: !!document.querySelector('.hub-topbar'),
      caps: document.querySelectorAll('.hub-topbar .tb-item').length,
      moreBtn: !!document.getElementById('tbMoreBtn'),
      search: !!document.getElementById('sideSearch'),
      kbd: !!document.querySelector('.tb-search kbd'),
      hstat: document.querySelectorAll('.hstat').length,
      rail: !!document.getElementById('homeRail'),
      railPct: (document.getElementById('railPct') || {}).textContent || '',
      dots: document.querySelectorAll('#railDots i').length,
      week7: document.querySelectorAll('#homeWeek7 .c, #homeWeek7 .w7 .c, #homeWeek7 > *').length,
      threeHidden: (() => { const t = document.getElementById('threeThings'); return !!t && t.hidden; })(),
      tasksShown: (() => { const t = document.getElementById('dashTodayTasks'); return !!t && t.offsetHeight > 0; })(),
      hline: !!document.querySelector('.hline'),
      helper: !!document.getElementById('dashHeroNum') && /距机考还有/.test(document.getElementById('dashHeroNum').textContent),
      mods: document.querySelectorAll('.hmod').length,
      bodyHome: document.body.classList.contains('hub-home'),
      padL: getComputedStyle(document.body).paddingLeft
    }));
    ok('顶栏渲染', m.topbar);
    ok('胶囊 9 项（T-014 把回顾提为一级）', m.caps === 9, 'got ' + m.caps);
    ok('「更多」按钮', m.moreBtn);
    ok('A3b 搜索框 + Ctrl K 角标', m.search && m.kbd);
    ok('四数字卡', m.hstat === 4, 'got ' + m.hstat);
    ok('侧轨 + 完成度环（% 文本）', m.rail && /%$/.test(m.railPct), m.railPct);
    /* HOME-STREAK-DEL（10-26）：侧轨「连续天数」整块已删（她拍板「没什么用」），#railDots 跟着没了。
       旧断言「近 7 天点阵 7 个」是旧口径 → 按新事实反过来判：点阵必须不存在，
       且替代它的 7 格周历（#homeWeek7）还在。 */
    ok('连续天数点阵已删（HOME-STREAK-DEL）', m.dots === 0, 'got ' + m.dots);
    ok('7 格周历仍在（完成度卡内）', m.week7 > 0, 'got ' + m.week7);
    ok('有今日计划 → 三件事收起、任务卡上场', m.threeHidden && m.tasksShown);
    ok('倒计时一行化文案', m.hline && m.helper);
    ok('常用模块 2×2', m.mods === 4, 'got ' + m.mods);
    ok('body.hub-home + 左侧留白归零', m.bodyHome && m.padL === '0px', m.padL);

    // Ctrl+K 聚焦搜索
    await p.keyboard.press('Control+k');
    await sleep(200);
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
    ok('Ctrl+K 聚焦搜索框', focused === 'sideSearch', 'active=' + focused);

    // 搜索行为复用侧栏那套（中文 → 功能跳转项）
    await p.fill('#sideSearch', '口语');
    await sleep(300);
    const hit = await p.evaluate(() => {
      const panel = document.getElementById('ssPanel');
      const items = panel ? panel.querySelectorAll('.ss-item') : [];
      return { open: panel && !panel.hidden, n: items.length, first: items[0] ? items[0].textContent.trim().slice(0, 12) : '' };
    });
    ok('搜索面板出功能项', hit.open && hit.n >= 1, JSON.stringify(hit));
    await p.keyboard.press('Escape');

    /* 软导航跨边界。🔴 10-22 更新：bank 第 5 批也换成顶栏壳 → 「换侧栏」这一段没了
       （全站已无侧栏活样本）。改成同壳口径：点「模考」胶囊 → 壳不重建、留白不回来、
       高亮移到「模考」；再点顶栏「首页」→ 回到 home（body.hub-home 回来）。 */
    await p.click('.hub-topbar a.tb-item[href="bank.html"]');
    try{ await p.waitForFunction(() => /hub-topbar/.test((document.getElementById('mainNav')||{}).className||''), { timeout: 20000 }); }catch(e){}
    await sleep(600);
    const away = await p.evaluate(() => ({
      url: location.pathname,
      navClass: (document.getElementById('mainNav') || {}).className || '',
      sideItems: document.querySelectorAll('#mainNav .side-item').length,
      padL: getComputedStyle(document.body).paddingLeft,
      onCaps: [...document.querySelectorAll('.hub-topbar .tb-item.on')].map(a => (a.textContent || '').trim()),
      bodyHome: document.body.classList.contains('hub-home')
    }));
    ok('home→bank：壳仍是顶栏（第 5 批起 bank 也换了壳）', /bank/.test(away.url) && /hub-topbar/.test(away.navClass) && away.sideItems === 0 && !away.bodyHome, JSON.stringify(away));
    ok('home→bank：288px 侧栏留白没回来', away.padL === '0px', away.padL);
    ok('home→bank：高亮 = 机经', away.onCaps.join('') === '机经', away.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）

    const homeLink = await p.$('.hub-topbar a.tb-item[href="home.html"]');
    if (homeLink) {
      await homeLink.click();
      try{ await p.waitForFunction(() => document.body.classList.contains('hub-home'), { timeout: 20000 }); }catch(e){}
      await sleep(600);
    }
    const back = await p.evaluate(() => ({
      url: location.pathname,
      topbar: !!document.querySelector('.hub-topbar'),
      caps: document.querySelectorAll('.hub-topbar .tb-item').length,
      bodyHome: document.body.classList.contains('hub-home'),
      search: !!document.getElementById('sideSearch')
    }));
    ok('bank→home：换回顶栏（胶囊 + 搜索都在）', back.topbar && back.caps === 9 && back.bodyHome && back.search, JSON.stringify(back));
    ok('桌面零 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  console.log('■ 手机 390×844（触屏）：折叠侧轨 + dock');
  {
    const { ctx, p, errs } = await boot(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await p.evaluate(() => ({
      capsHidden: (() => { const el = document.querySelector('.tb-caps'); return el ? getComputedStyle(el).display === 'none' : true; })(),
      searchHidden: (() => { const el = document.querySelector('.tb-search'); return el ? getComputedStyle(el).display === 'none' : true; })(),
      toggleShown: (() => { const el = document.getElementById('railToggle'); return el ? getComputedStyle(el).display !== 'none' : false; })(),
      openBefore: document.getElementById('homeRail').classList.contains('open'),
      bodyH: 0,
      dock: !!document.getElementById('hubDock'),
      hstat: document.querySelectorAll('.hstat').length
    }));
    ok('手机隐藏胶囊与搜索框', m.capsHidden && m.searchHidden);
    ok('侧轨折叠条可见且默认收起', m.toggleShown && !m.openBefore);
    ok('底部 dock 仍在', m.dock);
    ok('数字卡 2×2 布局（4 张）', m.hstat === 4);

    await p.click('#railToggle');
    await sleep(300);
    const opened = await p.evaluate(() => ({
      open: document.getElementById('homeRail').classList.contains('open'),
      expanded: document.getElementById('railToggle').getAttribute('aria-expanded'),
      bodyVisible: getComputedStyle(document.getElementById('railBody')).display !== 'none'
    }));
    ok('点折叠条展开侧轨（aria-expanded=true）', opened.open && opened.expanded === 'true' && opened.bodyVisible, JSON.stringify(opened));
    ok('手机零 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(2); });
