/* LANDING-C-1118（11-18 上线）首页回归：暖白备考工作台整页，站点学士帽图标，四张真页面图。
   口径变化：旧版「有学习数据自动跳 /home」随新落地页撤掉；根路径对所有访问者展示新首页。
   用法：node tests/_with_server.cjs tests/_probe_landing114_1021.cjs 8867 */
const { chromium } = require('playwright-core');
const EDGE = process.env.PW_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8867';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  console.log('■ 桌面 1440×1000：整页、图片、图标、试一题');
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('ielts_study_hub_v1', 'x'.repeat(300)); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = [], bad = [];
    p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
    p.on('request', r => {
      const u = r.url();
      if (!u.startsWith(BASE) && !u.startsWith('data:') && !/miaoda\.feishu\.cn|feishucdn\.com|cloudflareinsights\.com/.test(u)) bad.push(u);
    });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await sleep(1200);
    const m = await p.evaluate(() => ({
      title: document.title,
      h1: (document.querySelector('h1') || {}).innerText || '',
      h1count: document.querySelectorAll('h1').length,
      sections: document.querySelectorAll('main section').length,
      sectionIds: [...document.querySelectorAll('main section')].map(s => s.id || s.className).join(','),
      body: document.body.innerText,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      logo: (() => { const x = document.querySelector('.brand-mark img'); return x ? { src: x.getAttribute('src'), ok: x.complete && x.naturalWidth > 0 } : null; })(),
      imgs: [...document.images].map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })),
      links: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))]
    }));
    ok('标题是新落地页', /雅思备考 Hub｜今天该练什么，打开就知道/.test(m.title), m.title);
    ok('唯一 h1 + 新主张', m.h1count === 1 && /雅思机考/.test(m.h1) && /打开就知道/.test(m.h1), JSON.stringify(m.h1));
    ok('七段结构完整', m.sections === 7 && m.sectionIds === 'hero,try,features,proof,more,free,final', 'got ' + m.sections + '，' + m.sectionIds);
    ok('真数据带 627 / 89 / 42', ['627', '89', '42'].every(x => m.body.includes(x)));
    ok('免费与会员边界明确', m.body.includes('免费') && m.body.includes('会员') && !/¥|价格|收费|提分|保过|包过/.test(m.body));
    ok('站点学士帽图标真实加载', m.logo && m.logo.src === '/favicon.svg?v=7' && m.logo.ok, JSON.stringify(m.logo));
    ok('四张产品图引用正式资源', new Set(m.imgs.filter(x => x.src && x.src.startsWith('img/landing/')).map(x => x.src)).size === 4, JSON.stringify(m.imgs.map(x => x.src)));
    ok('/home 与 /login 接线在', m.links.includes('/home') && m.links.includes('/login'), JSON.stringify(m.links));
    ok('无旧版 home.html 链接', !m.links.includes('home.html'));
    ok('桌面无横向溢出', m.overflowX <= 0, 'overflowX=' + m.overflowX);

    for (let y = 0; y < await p.evaluate(() => document.body.scrollHeight); y += 600) { await p.evaluate(y => scrollTo(0, y), y); await sleep(70); }
    await sleep(500);
    await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 6000 }).catch(() => {});
    const imgs = await p.evaluate(() => [...document.images].map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
    ok('全部图片加载成功', imgs.every(x => x.ok), JSON.stringify(imgs.filter(x => !x.ok)));
    await p.locator('.quiz-opt').nth(1).click();
    const wrong = await p.locator('.quiz-feedback').innerText();
    await p.locator('.quiz-opt').nth(0).click();
    const right = await p.locator('.quiz-feedback').innerText();
    await p.locator('.quiz-again').click();
    const reset = await p.locator('.quiz-feedback').innerText();
    ok('试一题正误与重置', /还差一点/.test(wrong) && /对了/.test(right) && reset === '', wrong + ' / ' + right + ' / ' + reset);
    ok('老用户有本机数据也不再自动跳走', /yasihub\.com|127\.0\.0\.1/.test(await p.evaluate(() => location.host)) && !/\/home/.test(await p.evaluate(() => location.pathname)));
    ok('零 pageerror / 零禁止外链', errs.length === 0 && bad.length === 0, errs.concat(bad).join(' | '));
    await ctx.close();
  }

  for (const v of [{ w: 390, h: 844, n: '390' }, { w: 360, h: 800, n: '360' }]) {
    console.log('■ 手机 ' + v.n);
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await sleep(900);
    const m = await p.evaluate(() => ({
      navHidden: (() => { const el = document.querySelector('.nav-links'); return el ? getComputedStyle(el).display === 'none' : true; })(),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroVis: (() => { const h = document.querySelector('h1'); if (!h) return false; const r = h.getBoundingClientRect(); return r.width > 200 && r.height > 40; })(),
      cta: (() => { const a = document.querySelector('.actions a[href="/home"]'); if (!a) return false; const r = a.getBoundingClientRect(); return r.height >= 44 && r.width > 100 && getComputedStyle(a).display !== 'none'; })()
    }));
    ok(v.n + ' 导航折叠', m.navHidden);
    ok(v.n + ' 无横向溢出', m.overflowX <= 0, 'overflowX=' + m.overflowX);
    ok(v.n + ' 首屏标题可见', m.heroVis);
    ok(v.n + ' 主 CTA 可见可点', m.cta);
    ok(v.n + ' 零 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(2); });
