/* 10-21 design/114A1「真诚务实」落地页落地批（她 14:59 点名「接下去做这个」）：
   ① 线上 index.html = 114A1 内容重写版：零价格零会员零提分承诺（她的原话：不要过度宣传 / 不要过度承诺 /
      不要把会员效果放进去 / 落地页不要写收费的内容）；
   ② 数据带只放站内真口径（627 篇真题 / 89 条口语题卡 / 42 套模板 / 4 科 AI 反馈）；
   ③ 老用户自动跳过行为一字不动（有学习数据 → home.html；?landing=1 例外）。
   用法：node tests/_with_server.cjs tests/_probe_landing114_1021.cjs 8867 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8867';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };
const BAN = /免费|会员|¥|价格|收费|付费|提分|保过|包过|过线|承诺\s*\d/;

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  console.log('■ 桌面 1440×900：内容与合规');
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const errs = [], bad = [];
    p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
    /* 线上 CF 会自己注入 Web Analytics 的 beacon（static.cloudflareinsights.com），那是平台行为、不是本站引入的
       外部依赖 → 允许这一条；其余任何外部请求仍判红（本站零外链是硬要求）。 */
    p.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !/cloudflareinsights.com/.test(u)) bad.push(u); });
    await p.goto(BASE + '/index.html?landing=1', { waitUntil: 'load' });
    await sleep(1000);
    const m = await p.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).innerText || '',
      sections: document.querySelectorAll('section').length,
      links: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /\.html/.test(h)))],
      body: document.body.innerText,
      band: ['627', '89', '42'].every(x => document.body.innerText.includes(x)),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    ok('标题落在「从今天的清单开始」', /从\s*今天的清单\s*开始/.test(m.h1.replace(/\n/g, '')), JSON.stringify(m.h1));
    ok('六段结构（数据带/功能/AI/对比/三步/结尾）', m.sections === 6, 'got ' + m.sections);
    ok('数据带是真口径（627 / 89 / 42）', m.band);
    ok('链接只指向站内真页面', m.links.every(h => ['home.html', 'login.html', 'legal.html'].includes(h)), JSON.stringify(m.links));
    ok('无任何商业字样 / 提分承诺', !BAN.test(m.body), (m.body.match(BAN) || [])[0] || '');
    ok('桌面无横向溢出', m.overflowX <= 0, 'overflowX=' + m.overflowX);
    ok('零 pageerror / 零外部请求', errs.length === 0 && bad.length === 0, errs.concat(bad).join(' | '));

    // 老用户自动跳过（有数据 → home.html）；?landing=1 例外
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { name: 'Probe' }, words: Array(40).fill(1).map((_, i) => ({ id: 'w' + i, en: 'e' + i, cn: 'c' })), sessions: [], plans: [] })); } catch (e) {} });
    await p2.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const dest = await p2.evaluate(() => location.pathname);
    ok('老用户访问 / 自动进 home', /home/.test(dest), dest);
    await p2.close();
    await ctx.close();
  }

  console.log('■ 手机 390×844：排版');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
    await p.goto(BASE + '/index.html?landing=1', { waitUntil: 'load' });
    await sleep(900);
    const m = await p.evaluate(() => ({
      navlinksHidden: (() => { const el = document.querySelector('.navlinks'); return el ? getComputedStyle(el).display === 'none' : true; })(),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroVis: (() => { const h = document.querySelector('h1'); if (!h) return false; const r = h.getBoundingClientRect(); return r.width > 200 && r.height > 40; })(),
      ctaVisible: [...document.querySelectorAll('.cta a')].filter(a => a.getBoundingClientRect().height > 30).length
    }));
    ok('手机隐藏顶部锚点链接', m.navlinksHidden);
    ok('手机无横向溢出', m.overflowX <= 0, 'overflowX=' + m.overflowX);
    ok('hero 标题可见', m.heroVis);
    ok('主 CTA 可见且可点', m.ctaVisible >= 2, 'got ' + m.ctaVisible);
    ok('手机零 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(2); });
