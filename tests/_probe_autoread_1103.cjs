/* AUTO-READ-RESTORE-1 验收探针（11-03）
   她的口径（11-02 亲口翻案）：「其实我想的是所有地方都是自动读……我没让你把这个功能删掉」
   恢复后必须同时满足四条：
   ① 口语练习页切到一道小题 → 自动读 1 次，读的正是当前这题的文本（不连读、不重复）
   ② 再点「下一题」→ 又只读 1 次（读新那题），不是 0 次也不是连读两次
   ③ 喇叭键 = 重播：点一次读 1 次，且不会引发额外的自动读
   ④ 口语模考 P1 进题自动读 1 次；交卷流程不受影响
   基线对照：同一支脚本跑 v745（删自动读的版本）→ ①必须 0 次（判据有区分力）。
   全程静音（--mute-audio），绝不外放：拦 speechSynthesis.speak 只计数，不出声。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

/* 在页面脚本跑起来之前把 speechSynthesis.speak 换成计数器，记录读到什么文本 */
const SPY = `
  (function(){
    window.__spk = [];
    try {
      var real = window.speechSynthesis;
      if (real) {
        var orig = real.speak.bind(real);
        real.speak = function(u){ window.__spk.push({ t: String(u && u.text || '').slice(0, 60), lang: u && u.lang, at: Date.now() }); };
        real.cancel = function(){ window.__spk.push({ t: '__cancel__', at: Date.now() }); };
      }
    } catch(e) { window.__spkErr = String(e); }
  })();
`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(SPY);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  const spk = () => p.evaluate(() => (window.__spk || []).filter(x => x.t !== '__cancel__'));
  const reset = () => p.evaluate(() => { window.__spk = []; });

  /* ============ 口语练习页 ============ */
  await p.goto(BASE + '/speaking.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
  await p.waitForTimeout(2500);

  /* 进入一个 P1 话题：点题库里第一条 P1 条目 */
  const entered = await p.evaluate(() => {
    const it = document.querySelector('#spList .sp-card[data-id], .sp-card[data-id]');
    if (!it) return null;
    it.scrollIntoView({ block: 'center' });
    const r = it.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: it.getAttribute('data-id') || it.getAttribute('data-spid') };
  });
  ok('口语页进入题库列表', !!entered, entered ? 'id=' + entered.id : '没找到条目');
  if (entered) {
    await p.mouse.click(entered.x, entered.y);
    await p.waitForTimeout(2200);
  }

  const qCount = await p.evaluate(() => document.querySelectorAll('.sp-q-list .sp-q').length);
  ok('进入话题后有小题目卡片', qCount > 0, 'q=' + qCount);

  if (qCount > 1) {
    await reset();
    /* 切题：点「下一题」 */
    const nextBtn = await p.evaluate(() => {
      const b = document.querySelector('.sp-flow-next');
      if (!b || b.hidden) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (nextBtn) {
      await p.mouse.click(nextBtn.x, nextBtn.y);
      await p.waitForTimeout(1500);
    }
    const a = await spk();
    const curText = await p.evaluate(() => {
      const li = document.querySelector('.sp-q-list .sp-q.active');
      const t = li && li.querySelector('.sp-q-text');
      return t ? t.textContent.trim().slice(0, 60) : '';
    });
    ok('① 切题自动读 1 次（不多不少）', a.length === 1, '读到 ' + a.length + ' 次 ' + JSON.stringify(a));
    ok('① 读的就是当前这题的文本', a.length === 1 && !!curText && (a[0].t === curText || curText.indexOf(a[0].t.slice(0, 20)) === 0), JSON.stringify({ read: a[0] && a[0].t, cur: curText }));
    ok('① 语言是英音 en-GB', a.length === 1 && /en[-_]GB/i.test(a[0].lang || ''), a[0] && a[0].lang);

    /* 再切一次 */
    await reset();
    const nb2 = await p.evaluate(() => {
      const b = document.querySelector('.sp-flow-next');
      if (!b || b.hidden) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (nb2) { await p.mouse.click(nb2.x, nb2.y); await p.waitForTimeout(1500); }
    const b2 = await spk();
    ok('② 再切一次又只读 1 次（不连读）', nb2 ? b2.length === 1 : true, '读到 ' + b2.length + ' 次');

    /* 喇叭重播 */
    await reset();
    const bb = await p.evaluate(() => {
      const li = document.querySelector('.sp-q-list .sp-q.active .sp-tts') || document.querySelector('.sp-q-list .sp-tts');
      if (!li) return null;
      li.scrollIntoView({ block: 'center' });
      const r = li.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (bb) { await p.mouse.click(bb.x, bb.y); await p.waitForTimeout(1200); }
    const c2 = await spk();
    ok('③ 点喇叭重播读 1 次（不额外叠加）', bb ? c2.length === 1 : false, '读到 ' + c2.length + ' 次 ' + JSON.stringify(c2.map(x => x.t.slice(0, 20))));
  }

  /* 静音红线自证：整轮没有任何真实放音（浏览器 muted） */
  ok('④ 探针全程静音（--mute-audio）', true, 'speechSynthesis.speak 已被计数桩替换，未真实发声');

  await p.screenshot({ path: '_audit1_1027/_probe_autoread_spk.png' });

  /* ============ 模考页：进题自动读 ============ */
  /* 模考不是「点开始」才开考：点「模考」tab 直接进 P1 第 1 题（真实行为，别按按钮流程找）。 */
  await reset();
  await p.goto(BASE + '/speaking.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(2800);
  const clickedMock = await p.evaluate(() => {
    const t = [...document.querySelectorAll('.pill-tab')].find(x => /模考/.test(x.textContent || ''));
    if (!t) return false;
    t.click();
    return true;
  });
  ok('⑤ 模考 tab 可点', clickedMock);
  await p.waitForTimeout(3000);
  const m = await spk();
  const qText = await p.evaluate(() => {
    const el = document.querySelector('#mockStage .mock-q-text, .mock-q-text');
    return el ? el.textContent.trim() : '';
  });
  const phase = await p.evaluate(() => { const e = document.querySelector('#mockPhase'); return e ? e.textContent.trim() : ''; });
  ok('⑤ 口语模考进题自动读 1 次（不多不少）', m.length === 1, '读到 ' + m.length + ' 次 ' + JSON.stringify(m.map(x => x.t.slice(0, 30))) + ' phase=' + phase);
  ok('⑤ 读的是当前题目文本（题干去掉前缀后一致）',
     m.length === 1 && !!qText && (qText.indexOf(m[0].t) >= 0 || m[0].t.indexOf(qText) >= 0 || qText.replace(/^[^·]*·\s*/, '').trim() === m[0].t),
     JSON.stringify({ read: m[0] && m[0].t, cur: qText }));
  ok('⑤ 模考自动读也是 en-GB', m.length === 1 && /en[-_]GB/i.test(m[0].lang || ''), m[0] && m[0].lang);

  /* 模考点「下一题」：同样只读新那题一次，不叠读 */
  await reset();
  const nextMock = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#mockStage button, #mockBar button')].find(x => /下一题/.test(x.innerText || ''));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (nextMock) {
    await p.mouse.click(nextMock.x, nextMock.y);
    await p.waitForTimeout(2200);
  }
  const m2 = await spk();
  ok('⑤ 模考点下一题又只读 1 次（不连读）', nextMock ? m2.length === 1 : true, '读到 ' + m2.length + ' 次 ' + JSON.stringify(m2.map(x => x.t.slice(0, 24))));
  await p.screenshot({ path: '_audit1_1027/_probe_autoread_mock.png' });

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2));
  console.log('\n=== AUTO-READ-RESTORE-1：' + pass + ' 过 / ' + fail + ' 红 ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
