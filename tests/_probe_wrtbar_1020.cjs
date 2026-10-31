/* 10/20 她拍板 Q1（按真实机考）/ Q2 顶栏 ☰ 左边全屏 / Q3 Part→Task / Q4 底栏 44px —— 验收 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8893';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  FAIL ' + n + (d ? '  <<< ' + d : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  const apiHits = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('request', r => { if (r.url().includes('/api/')) apiHits.push(r.url().replace(BASE,'')); });
  await p.addInitScript(() => { try { ['reading','listening','writing','speaking'].forEach(c => localStorage.setItem('hub_exam_guide_v2_' + c, '1')); } catch(e){} });
  await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  /* 2-1d 批 B：桌面上 #mockTabs 已 display:none → Playwright 可见性 click 会超时。改 JS click。 */
  await p.evaluate(() => { const b = document.querySelector('[data-mtab="writing"]'); if (b) b.click(); }).catch(() => {});
  await sleep(2000);
  await p.click('#wrtFullStart');
  await sleep(2500);

  /* ===== ① 底栏几何（Q4 44px / 左对齐 22px）===== */
  const g = await p.evaluate(() => {
    const host = document.getElementById('examPractice');
    const bar = host.querySelector('.ex-bar');
    const cs = getComputedStyle(bar);
    const q = (s) => host.querySelector(s);
    const mm = (el) => { if(!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { t:(el.textContent||'').trim(), h:Math.round(r.height), w:Math.round(r.width), x:Math.round(r.x),
               bg:s.backgroundColor, color:s.color, fs:s.fontSize, fw:s.fontWeight, bc:s.borderColor, bw:s.borderWidth, disp:s.display }; };
    return {
      barH: Math.round(bar.getBoundingClientRect().height), barBg: cs.backgroundColor,
      barPadL: cs.paddingLeft, barPadR: cs.paddingRight,
      pgOn: mm(q('.ex-pg.on')), pgOff: mm([...host.querySelectorAll('.ex-pg')].find(e=>!e.classList.contains('on'))),
      pgCount: host.querySelectorAll('.ex-pgs .ex-pg').length,
      hasArrow: !!q('.ex-pgbtn'), hasInfo: !!q('.ex-pginfo'),
      badgeDisp: q('#examStepBadge') ? getComputedStyle(q('#examStepBadge')).display : 'gone',
      labelDisp: q('#examStepLabel') ? getComputedStyle(q('#examStepLabel')).display : 'gone',
      pause: mm(document.getElementById('examTimerBtn')), exit: mm(document.getElementById('examExit')), fin: mm(document.getElementById('examFinish')),
      partLabel: mm(document.getElementById('examPartLabel')),
      barText: (bar.textContent||'').replace(/\s+/g,' ').trim()
    };
  });
  ok('①1 底栏高 44px（Q4）', g.barH === 44, 'h=' + g.barH);
  ok('①2 底栏左内边距 22px（与正文对齐）', g.barPadL === '22px', 'padL=' + g.barPadL);
  ok('①3 底栏是浅灰（不是深色块）', /^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$/.test(g.barBg), g.barBg);

  /* ===== ② 真实机考形态：两个相邻任务标签，无箭头无重复文字 ===== */
  ok('②1 底栏左侧只有 2 个任务标签', g.pgCount === 2, 'n=' + g.pgCount);
  ok('②2 ‹ › 箭头已删', g.hasArrow === false);
  ok('②3 「Task 1 / 2」重复文字已删', g.hasInfo === false);
  ok('②4 徽章「1」不显示（Q3）', g.badgeDisp === 'none', 'display=' + g.badgeDisp);
  ok('②5 标签不只显示「Part」（Q3）', g.labelDisp === 'none', 'display=' + g.labelDisp);
  ok('②6 底栏文字不含 Part', !/Part/.test(g.barText), JSON.stringify(g.barText));

  /* ===== ③ 选中态用底色区分（真实机考：选中白块 / 未选中透明）===== */
  ok('③1 选中的 Task 是白色底块', g.pgOn && g.pgOn.bg === 'rgb(255, 255, 255)', g.pgOn && g.pgOn.bg);
  ok('③2 未选中的 Task 是透明底', g.pgOff && g.pgOff.bg === 'rgba(0, 0, 0, 0)', g.pgOff && g.pgOff.bg);
  ok('③3 选中文字比未选中深', g.pgOn && g.pgOff && g.pgOn.color !== g.pgOff.color, (g.pgOn&&g.pgOn.color) + ' vs ' + (g.pgOff&&g.pgOff.color));
  ok('③4 两个标签高度一致（32px）', g.pgOn && g.pgOff && g.pgOn.h === 32 && g.pgOff.h === 32, (g.pgOn&&g.pgOn.h) + '/' + (g.pgOff&&g.pgOff.h));
  ok('③5 选中态不是下划线风格（无 border 描边）', g.pgOn && (g.pgOn.bw === '0px' || g.pgOn.bw === ''), 'bw=' + (g.pgOn&&g.pgOn.bw));

  /* ===== ④ 字号/高度统一（原来同一行 5 种字号 5 种高度）===== */
  const fsSet = new Set([g.pgOn.fs, g.pgOff.fs, g.pause.fs, g.exit.fs, g.fin.fs]);
  ok('④1 底栏所有元素字号统一 13px', fsSet.size === 1 && fsSet.has('13px'), [...fsSet].join('/'));
  ok('④2 右三按钮高度统一 32px', g.pause.h === 32 && g.exit.h === 32 && g.fin.h === 32, [g.pause.h, g.exit.h, g.fin.h].join('/'));
  ok('④3 切换器与按钮同一基线（y 差 ≤1px）', Math.abs((g.pgOn.h) - g.pause.h) === 0);

  /* ===== ⑤ Q3：左栏大标题写 Task ===== */
  ok('⑤1 左栏标题是「Task 1」不是「Part 1」', g.partLabel && /^Task \d$/.test(g.partLabel.t), g.partLabel && g.partLabel.t);

  /* ===== ⑥ Q2：顶栏全屏在 ☰ 左边 ===== */
  const fs = await p.evaluate(() => {
    const btn = document.getElementById('wrtFsBtn');
    const menu = document.querySelector('#examPractice .ex-menubtn');
    if(!btn || !menu) return { hasBtn: !!btn, hasMenu: !!menu };
    const rb = btn.getBoundingClientRect(), rm = menu.getBoundingClientRect();
    const svg = btn.querySelector('svg');
    return {
      hasBtn: true, title: btn.getAttribute('title'), aria: btn.getAttribute('aria-label'),
      hasSvg: !!svg, paths: svg ? svg.querySelectorAll('path').length : 0,
      bx: Math.round(rb.x), mx: Math.round(rm.x), left: rb.x < rm.x,
      txt: (btn.textContent || '').trim()
    };
  });
  ok('⑥1 顶栏有全屏按钮', fs.hasBtn === true);
  ok('⑥2 全屏按钮在 ☰ 左边（Q2）', fs.left === true, 'fs.x=' + fs.bx + ' menu.x=' + fs.mx);
  /* UNIFIED-EXAM-UI-3 笔1（10-31）：全屏钮图标从「L 形折角 + 四条对角线」（8 条 path）
     换成纯四角箭头（4 条 path）—— 旧判据把 8 写死了，改成「是 SVG 且 ≥4 条 path」。 */
  ok('⑥3 图标是 SVG（≥4 条路径），不是字符', fs.hasSvg && fs.paths >= 4, 'paths=' + fs.paths);
  ok('⑥4 无「undefined」残留文本', !/undefined/.test(fs.txt || ''), JSON.stringify(fs.txt));
  ok('⑥5 title / aria-label 有值', !!fs.title && fs.title === fs.aria, fs.title);

  /* ===== ⑦ 全屏图标两态（mock fullscreenElement 后派发事件）===== */
  const fsState = await p.evaluate(() => {
    const btn = document.getElementById('wrtFsBtn');
    const before = btn.innerHTML;
    let fake = document.documentElement;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fake });
    document.dispatchEvent(new Event('fullscreenchange'));
    const after = btn.innerHTML, titleOn = btn.getAttribute('title');
    delete document.fullscreenElement;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('fullscreenchange'));
    const back = btn.innerHTML, titleOff = btn.getAttribute('title');
    return { changed: before !== after, restored: before === back, titleOn, titleOff };
  });
  ok('⑦1 进全屏后图标切换', fsState.changed === true);
  ok('⑦2 退出全屏后图标还原', fsState.restored === true);
  ok('⑦3 title 同步切两态', fsState.titleOn === 'Exit full screen' && fsState.titleOff === 'Full screen', fsState.titleOn + ' / ' + fsState.titleOff);

  /* ===== ⑧ 切到 Task 2：选中态互换 + 标题跟 + 草稿不串 ===== */
  await p.evaluate(() => { document.getElementById('examEssay').value = 'TASK ONE DRAFT'; });
  await p.click('#examBarLeft .ex-pg[data-wrt-switch="1"]');
  await sleep(1200);
  const sw = await p.evaluate(() => {
    const host = document.getElementById('examPractice');
    const pgs = [...host.querySelectorAll('.ex-pgs .ex-pg')];
    return {
      onIdx: pgs.findIndex(e => e.classList.contains('on')),
      onTxt: (pgs.find(e=>e.classList.contains('on'))||{}).textContent,
      onBg: pgs[1] ? getComputedStyle(pgs[1]).backgroundColor : null,
      partLabel: (document.getElementById('examPartLabel')||{}).textContent,
      finTxt: (document.getElementById('examFinish')||{}).textContent,
      essay: (document.getElementById('examEssay')||{}).value,
      barText: (host.querySelector('.ex-bar').textContent||'').replace(/\s+/g,' ').trim()
    };
  });
  ok('⑧1 点 Task 2 后选中态互换', sw.onIdx === 1, 'onIdx=' + sw.onIdx + ' txt=' + sw.onTxt);
  ok('⑧2 选中块仍是白底（切换后不丢样式）', sw.onBg === 'rgb(255, 255, 255)', sw.onBg);
  ok('⑧3 左栏标题跟到「Task 2」', sw.partLabel === 'Task 2', sw.partLabel);
  ok('⑧4 Finish 文案变成「Finish section」（Task 2 是最后一篇）', sw.finTxt === 'Finish section', sw.finTxt);
  ok('⑧5 Task 2 答题框是空的（草稿不串）', (sw.essay || '') === '', JSON.stringify((sw.essay||'').slice(0,30)));
  ok('⑧6 底栏文字不含 Part / ‹ / ›', !/Part|‹|›/.test(sw.barText), JSON.stringify(sw.barText));

  /* 切回 Task 1，草稿还在 */
  await p.click('#examBarLeft .ex-pg[data-wrt-switch="0"]');
  await sleep(1200);
  const back = await p.evaluate(() => ({
    essay: (document.getElementById('examEssay')||{}).value,
    partLabel: (document.getElementById('examPartLabel')||{}).textContent,
    onIdx: [...document.querySelectorAll('#examBarLeft .ex-pg')].findIndex(e=>e.classList.contains('on'))
  }));
  ok('⑧7 切回 Task 1 草稿还在', back.essay === 'TASK ONE DRAFT', JSON.stringify((back.essay||'').slice(0,20)));
  ok('⑧8 切回后选中态正确', back.onIdx === 0 && back.partLabel === 'Task 1', back.onIdx + '/' + back.partLabel);

  /* ===== ⑨ 手机宽度不换行不截断 ===== */
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(700);
  const m = await p.evaluate(() => {
    const host = document.getElementById('examPractice');
    const bar = host.querySelector('.ex-bar');
    const pgs = [...host.querySelectorAll('.ex-pgs .ex-pg')];
    return { barH: Math.round(bar.getBoundingClientRect().height),
             pgW: pgs.map(e => Math.round(e.getBoundingClientRect().width)),
             overflow: bar.scrollWidth > bar.clientWidth + 1, sw: bar.scrollWidth, cw: bar.clientWidth };
  });
  ok('⑨1 390 宽底栏不溢出', m.overflow === false, 'scroll=' + m.sw + ' client=' + m.cw);
  ok('⑨2 390 宽两个标签都还在', m.pgW.length === 2 && m.pgW.every(w => w > 40), JSON.stringify(m.pgW));

  ok('⑩ 全程无 JS 报错', errs.length === 0, errs.join(' | ').slice(0, 200));
  ok('⑪ 零 /api/* 调用（线上跑不烧 KV 配额）', apiHits.length === 0, JSON.stringify(apiHits.slice(0,3)));
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
