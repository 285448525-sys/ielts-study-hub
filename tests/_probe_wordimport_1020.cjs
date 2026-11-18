/* 10-20 深夜 单词「AI 导入」回归：自动合并重复词 + AI 翻译补全
   她 22:3x 报「导入时不是会自动合并一样的单词以及自动 AI 翻译补全吗，现在怎么没有这个功能了」。
   根因 = importSmart() 拿 `DATA.settings.relayToken`（自备 Key 时代字段，10/1 已下线）当开关
   → 已登录但没自备 Key 的人永远进降级分支（只按正则抽词、不翻译）。

   本支**不发真实 AI 请求**：拦 <所有> api/ai 请求返回固定 JSON，只验「登录后这条路真的会走」+ 合并/翻译结果。
   用法：node tests/_with_server.cjs tests/_probe_wordimport_1020.cjs 8851 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8851';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

const FAKE = '[{"en":"apple","cn":"苹果","pos":"n.","ipa":"/ˈæpl/"},{"en":"banana","cn":"香蕉","pos":"n.","ipa":"/bəˈnɑːnə/"}]';

/* 2026-10-31 / 11-13 词书商城改造 + WORDBOOK-TABS-1（11-07）：
   老 [data-wtab="bank"] 已撤，wb-tabs.js 默认 #vMall 且把 #wmLegacy 收进 hidden。
   🔵 11-18 复核：现版唯一可达的导入入口是「设置」pane 里的 `#wbSettingsImport`
   （`importBook()` → `show('home')` + `#wmDealAdd`，实测展开 `#wlImpBody` / `#smartInput`）。
   商城里的 `#wmDealAdd` 属于 nobody 打开的旧树，点它没有可见结果，所以改走设置页这条真路径。 */
async function openCurrentImport(p) {
  await p.waitForFunction(() => !!(window.__wbTabs && typeof window.__wbTabs.show === 'function'), null, { timeout: 20000 });
  await p.evaluate(() => window.__wbTabs.show('set'));
  await p.waitForFunction(() => {
    const b = document.getElementById('wbSettingsImport');
    return !!b && b.getClientRects().length > 0;
  }, null, { timeout: 15000 });
  await p.evaluate(() => document.getElementById('wbSettingsImport').click());
  await p.waitForFunction(() => {
    const legacy = document.getElementById('wmLegacy');
    const body = document.getElementById('wlImpBody');
    const ta = document.getElementById('smartInput');
    return legacy && !legacy.hidden && body && !body.hidden && ta && ta.getClientRects().length > 0;
  }, null, { timeout: 15000 });
  await sleep(350);
}

async function boot(b, withToken) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  const aiCalls = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route('**/api/ai', async route => {
    let svc = '';
    try { svc = JSON.parse(route.request().postData() || '{}').service || ''; } catch (e) {}
    aiCalls.push(svc);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: FAKE } }] }) });
  });
  await p.addInitScript(([tok]) => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
      if (tok) localStorage.setItem('hub_auth_token', tok); else localStorage.removeItem('hub_auth_token');
    } catch (e) {}
  }, [withToken ? 'fake-session-token' : '']);
  await p.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  return { ctx, p, errs, aiCalls };
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ① 判据本身：aiAvailable() 的口径 */
  {
    const { ctx, p } = await boot(b, false);
    const noTok = await p.evaluate(() => (typeof aiAvailable === 'function') ? aiAvailable() : 'missing');
    await ctx.close();
    ok('①1 未登录且无自备 Key → aiAvailable() = false', noTok === false, String(noTok));

    const s2 = await boot(b, true);
    const hasTok = await s2.p.evaluate(() => (typeof aiAvailable === 'function') ? aiAvailable() : 'missing');
    await s2.ctx.close();
    ok('①2 已登录（有 session）→ aiAvailable() = true', hasTok === true, String(hasTok));
  }

  /* ② 登录态下「AI 导入」真的会调 AI + 合并重复词 + 补全翻译 */
  {
    const { ctx, p, errs, aiCalls } = await boot(b, true);
    /* 当前商城 #wmDealAdd → 旧词库导入区（wmShowLegacy + 展开折叠条） */
    await openCurrentImport(p);
    const hasBox = await p.evaluate(() => {
      const ta = document.querySelector('#smartInput');
      return !!ta && ta.getClientRects().length > 0;
    });
    ok('②1 词库页的导入框在', hasBox);

    /* 输入里故意放两条 apple（大小写不同）+ 一条 banana */
    await p.evaluate(() => {
      const ta = document.getElementById('smartInput');
      ta.value = 'apple 苹果\nApple\nbanana';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.click('#smartImport');
    /* 等两阶段（抽词 → 补全）跑完 */
    await p.waitForFunction(() => (DATA.words || []).some(w => /^banana$/i.test(w.en) && w.cn), null, { timeout: 20000 }).catch(() => {});
    await sleep(1200);

    const r = await p.evaluate(() => {
      const ws = DATA.words || [];
      const app = ws.filter(w => String(w.en).toLowerCase() === 'apple');
      const ban = ws.filter(w => String(w.en).toLowerCase() === 'banana');
      return {
        appleCount: app.length,
        appleCn: app[0] ? app[0].cn : '',
        applePos: app[0] ? app[0].pos : '',
        banCn: ban[0] ? ban[0].cn : '',
        banIpa: ban[0] ? ban[0].ipa : '',
        hint: (document.getElementById('importHint') || {}).textContent || '',
        inputCleared: (document.getElementById('smartInput') || {}).value === ''
      };
    });

    ok('②2 真的调了站内 AI（service=words）', aiCalls.length >= 1 && aiCalls.every(s => s === 'words'), aiCalls.join(','));
    ok('③1 重复的 apple 只留 1 条（自动合并）', r.appleCount === 1, 'count=' + r.appleCount);
    ok('③2 apple 拿到了 AI 中文释义', r.appleCn === '苹果', r.appleCn);
    ok('③3 apple 拿到了词性', r.applePos === 'n.', r.applePos);
    ok('③4 banana 有释义', r.banCn === '香蕉', r.banCn);
    ok('③5 banana 有音标（导入即完全体）', /bəˈnɑːnə/.test(r.banIpa || ''), r.banIpa);
    ok('③6 提示语是「成功导入」而不是「AI 暂不可用」', /成功导入/.test(r.hint) && !/AI 暂不可用/.test(r.hint), r.hint.slice(0, 60));
    ok('③7 导入后输入框被清空', r.inputCleared);
    ok('③8 全程零 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ④ 未登录时仍走降级（不能因为改了判据就对着未登录用户报错） */
  {
    const { ctx, p, errs } = await boot(b, false);
    await openCurrentImport(p);
    await p.evaluate(() => {
      const ta = document.getElementById('smartInput');
      ta.value = 'cherry\ncherry';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.click('#smartImport');
    await sleep(1500);
    const r = await p.evaluate(() => ({
      cnt: (DATA.words || []).filter(w => String(w.en).toLowerCase() === 'cherry').length,
      hint: (document.getElementById('importHint') || {}).textContent || ''
    }));
    ok('④1 未登录：仍能导入且去重（走降级）', r.cnt === 1, 'count=' + r.cnt);
    ok('④2 未登录：提示语说明未翻译', /未翻译|AI 暂不可用/.test(r.hint), r.hint.slice(0, 60));
    ok('④3 未登录：零 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
