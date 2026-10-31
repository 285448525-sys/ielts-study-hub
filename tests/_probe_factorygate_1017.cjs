/* 10/17 首屏减重第二步 · 写作出厂内容外移 —— 功能探针（commit B 版）
   证明：
     A 惰性：不主动加载（首页不加载出厂内容 → data.js 首屏减重成立）
     B 按需：ensureWriting() 真把 js/factory-writing.js 拉起来，模板/语料就位，闸放开
     C 安全：未就绪时本机数据零清零、不上传、不合并、迁移挂起；就绪后官方条目自动补齐且不覆盖个人数据
     D 静态页：writing.html / wrongbook.html 直接引脚本 → 打开即就位（无需点击）
   跑法：node tests/_with_server.cjs tests/_probe_factorygate_1017.cjs 8917 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8917';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED_ONB = () => {
  if (!localStorage.getItem('hub_onboarding_v2')) {
    localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
  }
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });

  /* ───── A/B：惰性 + 按需（首页，全新本地存储）───── */
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(SEED_ONB);
    const errs = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('request', r => { if (/factory-writing/.test(r.url())) errs.push('__REQ__' + r.url()); });

    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    const a = await p.evaluate(() => ({
      hasF: !!window.HUB_FACTORY,
      ready: !!(window.HUB_FACTORY && window.HUB_FACTORY.readyWriting),
      wLen: (DATA.writing || []).length,
      pLen: (DATA.writingPhrases || []).length,
      hooked: !!(window.HUB_FACTORY && typeof window.HUB_FACTORY.loadWriting === 'function'),
    }));
    ok(a.hasF, 'A① 就绪闸对象存在');
    ok(a.ready === false, 'A② 首页不主动加载出厂内容（readyWriting = false）→ 首屏确实少下 20KB');
    ok(a.wLen === 0 && a.pLen === 0, 'A③ 未加载时这两个字段是本机读到的值（全新设备为空）');
    ok(a.hooked === true, 'A④ 加载器已就位（common.js 注入）');
    ok(errs.filter(x => x.indexOf('__REQ__') === 0).length === 0, 'A⑤ 首页没有去请求出厂内容脚本（惰性成立）');

    const bres = await p.evaluate(async () => {
      const t0 = performance.now();
      const rs = await window.HUB_FACTORY.ensureWriting();
      await new Promise(r => setTimeout(r, 300));
      const strips = stripCloudFields(DATA);
      return {
        rs: rs, ready: window.HUB_FACTORY.readyWriting, ms: Math.round(performance.now() - t0),
        wLen: (DATA.writing || []).length, pLen: (DATA.writingPhrases || []).length,
        hasOfficial: (DATA.writing || []).some(t => t.id === 'wt_b5'),
        phrasesReady: (DATA.writingPhrases || []).length > 0,
        stripHasWriting: ('writing' in strips), stripHasPhrases: ('writingPhrases' in strips),
        fieldReady: window.HUB_FACTORY.fieldReady('writingPhrases'),
      };
    });
    ok(bres.rs === true && bres.ready === true, 'B① ensureWriting() 真把出厂内容拉起来了（' + bres.ms + 'ms）');
    ok(bres.wLen > 10, 'B② 写作模板就位（' + bres.wLen + ' 条）');
    ok(bres.hasOfficial === true, 'B③ 含官方模板 wt_b5（搬出来的内容正确应用）');
    ok(bres.pLen > 0, 'B④ 起步语料就位（' + bres.pLen + ' 条）');
    ok(bres.stripHasWriting === false, 'B⑤ 写作模板永远不上传（原有规则不变）');
    ok(bres.stripHasPhrases === true, 'B⑥ 就绪后起步语料恢复上传（闸放开）');
    ok(bres.fieldReady === true, 'B⑦ 就绪后字段可用');
    ok(errs.filter(x => x.indexOf('__ERR__') === 0).length === 0 && errs.filter(x => !x.startsWith('__REQ__')).length === 0, 'B⑧ 零页面错误');
    if (errs.length) console.log('     errs: ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ───── C：安全（本机已有数据 + 未就绪）───── */
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      SEED_ONB_INLINE();
      if (!localStorage.getItem('ielts_study_hub_v1')) {
        localStorage.setItem('ielts_study_hub_v1', JSON.stringify({
          settings: { examDate: '2026-12-01' }, words: [],
          writing: [
            { id: 'wt_a', level: '5.5', category: '动态图', title: '我改过的标题', skeleton: 'x', tips: 'y' },
            { id: 'myown_tpl', category: '观点型', title: '我自建的模板', skeleton: 'z', tips: 't' },
          ],
          writingPhrases: [{ id: 'myown1', type: '短语', en: 'my own phrase', cn: '我自己的语料' }],
        }));
      }
      function SEED_ONB_INLINE(){
        if (!localStorage.getItem('hub_onboarding_v2')) {
          localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
        }
      }
    });
    const errs = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);

    const r = await p.evaluate(() => {
      const F = window.HUB_FACTORY;
      const myOwn = (DATA.writing || []).find(t => t.id === 'myown_tpl');
      const strips = stripCloudFields(DATA);
      const merged = mergeData(DATA, {
        writingPhrases: [{ id: 'cloud1', en: 'cloud phrase' }],
        notes: [{ id: 'cloudnote1', text: '云端的笔记' }],
        words: [], settings: {}, deletedIds: [],
      });
      const md = (merged && merged.data) ? merged.data : merged;
      return {
        ready: F.readyWriting,
        wLen: (DATA.writing || []).length,
        myOwnTitle: myOwn ? myOwn.title : null,
        phraseOwn: (DATA.writingPhrases || []).some(x => x.id === 'myown1'),
        fieldReady: F.fieldReady('writingPhrases'),
        stripHasPhrases: ('writingPhrases' in strips),
        mergeTookCloudPhrase: ((md.writingPhrases || []).map(x => x.id).indexOf('cloud1') >= 0),
        mergeTookCloudNote: ((md.notes || []).map(x => x.id).indexOf('cloudnote1') >= 0),
      };
    });
    ok(r.ready === false, 'C① 未就绪（本机数据在，出厂内容没加载）');
    ok(r.wLen === 2, 'C② 本机写作数据未被清零（仍 2 条）');
    ok(r.myOwnTitle === '我自建的模板', 'C③ 用户自建模板原样保留');
    ok(r.phraseOwn === true, 'C④ 本机独有语料仍在');
    ok(r.fieldReady === false, 'C⑤ 字段判为不可用');
    ok(r.stripHasPhrases === false, 'C⑥ 未就绪时起步语料不上传（保护云端）');
    ok(r.mergeTookCloudPhrase === false, 'C⑦ 未就绪时该字段不参与合并');
    ok(r.mergeTookCloudNote === true, 'C⑧ 对照：其它字段照常合并');
    ok(r.wLen === 2, 'C⑨ 模板迁移挂起（没把官方模板一次性灌进来）');

    const after = await p.evaluate(async () => {
      await window.HUB_FACTORY.ensureWriting();
      await new Promise(r => setTimeout(r, 300));
      const strips = stripCloudFields(DATA);
      return {
        ready: window.HUB_FACTORY.readyWriting,
        wLen: (DATA.writing || []).length,
        hasOfficial: (DATA.writing || []).some(t => t.id === 'wt_b5'),
        keepsOwn: (DATA.writing || []).some(t => t.id === 'myown_tpl'),
        myOwnPhrase: (DATA.writingPhrases || []).some(x => x.id === 'myown1'),
        phrasesGrew: (DATA.writingPhrases || []).length >= 1,
        stripHasPhrases: ('writingPhrases' in strips),
      };
    });
    ok(after.ready === true, 'C⑩ 就绪标记已置位');
    ok(after.wLen > 10, 'C⑪ 就绪后官方模板自动补齐（' + after.wLen + ' 条）');
    ok(after.hasOfficial === true, 'C⑫ 补齐的是官方模板（含 wt_b5）');
    ok(after.keepsOwn === true, 'C⑬ 用户自建模板仍在（补齐不覆盖个人数据）');
    ok(after.myOwnPhrase === true, 'C⑭ 用户自己的语料没被出厂语料顶掉');
    ok(after.stripHasPhrases === true, 'C⑮ 就绪后恢复上传');
    ok(errs.length === 0, 'C⑯ 零页面错误');
    if (errs.length) console.log('     errors: ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ───── D：静态页直接引脚本（writing.html / wrongbook.html）───── */
  /* 10-23：wrongbook.html 已在 T-015 删除（现 302 → writing.html），从本支移除 */
  for (const page of ['writing.html']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(SEED_ONB);
    const errs = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE + '/' + page, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const d = await p.evaluate(() => ({
      ready: !!(window.HUB_FACTORY && window.HUB_FACTORY.readyWriting),
      wLen: (DATA.writing || []).length,
      pLen: (DATA.writingPhrases || []).length,
    }));
    ok(d.ready === true && d.wLen > 10, 'D[' + page + '] 打开即就位（模板 ' + d.wLen + ' 条 / 语料 ' + d.pLen + ' 条）');
    ok(errs.length === 0, 'D[' + page + '] 零页面错误');
    if (errs.length) console.log('     errors: ' + errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });