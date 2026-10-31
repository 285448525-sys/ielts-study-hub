/* 10/19 map 组结论条回归闸
   背景（HANDOFF §二 挂了两年）：段落信息匹配（type:"map" + reading）走矩阵表格，
   题号在 <b class="mx-no"> 里而不是 .ex-qn[data-qn]，也没有 .ex-blank →
   decoratePassage 的 anchor 恒 null → groupEl 恒 null → 该组一题都不挂 .ex-rv 结论条。
   实测证据：Muscle Loss 13 题只出 7 条（= 单选 2 + 填空 5），map 组 6 题全缺。
   本闸：开一篇含 map 组的阅读 → 全选后交卷 → 断言
     ① 该 map 组的每一题都有 .ex-rv（数量 == map 组题数）
     ② 结论条挂在正确的 .ex-group 里
     ③ 展开按钮能点开并显示 Correct answer
   跑法：node tests/_with_server.cjs tests/_probe_maprv_1019.cjs 8899 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';

/* 含 map 组的阅读篇（The Blockbuster Phenomenon，map 组 Q1-4，题库与答案都在） */
const UNIT = '2017137445827088386';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('hub_exam_guide_v2_reading', '1');
      localStorage.setItem('hub_exam_guide_v2_listening', '1');
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
    } catch (e) {}
  });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));

  await p.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await p.waitForSelector('.bank-item[data-unit]', { timeout: 25000 });

  /* bank.js 是 IIFE，openExam 不在 window 上 → 走真实路径：点列表项 */
  await p.click('.bank-item[data-unit="' + UNIT + '"]');
  await p.waitForSelector('#examRoot .ex-group', { timeout: 20000 });
  await p.waitForTimeout(800);

  /* 记录 map 组的题号与题数 */
  const mapInfo = await p.evaluate(() => {
    const gs = [...document.querySelectorAll('#examRoot .ex-group')];
    const g = gs.find(x => x.getAttribute('data-gtype') === 'map');
    if (!g) return null;
    const qs = [...g.querySelectorAll('.ex-lomatrix input[type=radio][data-q]')].map(r => r.getAttribute('data-q'));
    return { gid: g.getAttribute('data-g'), qs: [...new Set(qs)] };
  });
  ok(!!mapInfo, '找到 map 组（' + (mapInfo ? mapInfo.qs.length + ' 题' : '未找到') + '）');
  if (!mapInfo) { await b.close(); process.exit(1); }

  /* 全选 A 后交卷（故意全选错，确保结论条该出现且标 Incorrect） */
  await p.evaluate(qs => {
    qs.forEach(q => {
      const r = document.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + q + '"][value="A"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }, mapInfo.qs);

  /* 其余题型随便填一下，保证交卷流程完整 */
  await p.evaluate(() => {
    document.querySelectorAll('#examRoot input.ex-blank').forEach(i => {
      if (!i.value) { i.value = 'x'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    document.querySelectorAll('#examRoot .ex-opts .ex-opt input[type=radio]').forEach((r, i) => { if (i % 3 === 0) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } });
  });
  await p.waitForTimeout(400);

  const submit = await p.$('#examRoot [data-submit]');
  if (submit) { await submit.click(); } else { await p.evaluate(() => { const f = document.querySelector('#examRoot [data-submit]'); if (f) f.click(); }); }
  /* 交卷确认层：#exSubmitModal，确认按钮写死 [data-sok]（老探针找 .em-ok 全扑空） */
  await p.waitForSelector('#exSubmitModal', { timeout: 8000 });
  await p.click('#exSubmitModal [data-sok]');
  await p.waitForTimeout(3000);
  const submitState = await p.evaluate(() => ({
    modal: !!document.getElementById('exSubmitModal'),
    btn: (document.querySelector('#examRoot [data-submit]') || {}).textContent,
    rvAll: document.querySelectorAll('#examRoot .ex-rv').length,
    groups: document.querySelectorAll('#examRoot .ex-group').length,
    scored: (window.EX && EX.scored) === undefined ? 'n/a' : EX.scored
  }));
  console.log('  · 交卷态：' + JSON.stringify(submitState));

  const res = await p.evaluate(gid => {
    const g = document.querySelector('#examRoot .ex-group[data-g="' + gid + '"]');
    if (!g) return { groupGone: true };
    const rvs = [...g.querySelectorAll('.ex-rv')].map(x => x.getAttribute('data-q'));
    return {
      groupGone: false,
      rvCount: rvs.length,
      rvQs: rvs,
      hasBody: !!g.querySelector('.ex-rv .ex-rv-b'),
      firstCorrect: (g.querySelector('.ex-rv .ex-rv-b b') || {}).textContent || null,
      toggleBtn: !!g.querySelector('.ex-rv-tg')
    };
  }, mapInfo.gid);

  console.log('  · 交卷后 map 组结论条：' + JSON.stringify(res));

  ok(!res.groupGone, 'map 组仍在页面上');
  ok(res.rvCount === mapInfo.qs.length && res.rvQs.every(q => mapInfo.qs.indexOf(q) > -1), 'map 组每题都有结论条（期望 ' + mapInfo.qs.length + '，实得 ' + (res.rvCount || 0) + '）');
  ok(!!res.hasBody, '结论条有 Correct answer / Your answer 正文');
  ok(!!res.toggleBtn, '结论条有展开按钮');

  /* 点开第一条，验证能展开 */
  const opened = await p.evaluate(() => {
    const btn = document.querySelector('#examRoot .ex-rv .ex-rv-tg');
    if (!btn) return null;
    btn.click();
    const box = btn.closest('.ex-rv');
    return { open: box.classList.contains('open'), text: box.textContent.slice(0, 80) };
  });
  ok(opened && opened.open, '结论条能展开（' + (opened ? opened.text.replace(/\s+/g, ' ') : '—') + '）');

  ok(errs.length === 0, '零 pageerror' + (errs.length ? '（' + errs[0].slice(0, 80) + '）' : ''));

  await b.close();
  console.log('\n=== map 结论条回归：' + pass + ' 通过 / ' + fail + ' 失败 ===');
  process.exit(fail ? 1 : 0);
})();
