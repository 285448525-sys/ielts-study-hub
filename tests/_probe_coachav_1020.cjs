/* 10/20 深夜 · 陪练头像恢复卡通 + 思考文案换家族（她暴怒两项）
   背景：
   ①「你为啥把我英语陪练的头像改了，我是说陪练和考官用不一样的图片你听不懂吗，
      考官用真人陪练用卡通头像啊我真服了你给我改了干嘛」
      → 根因：b76cc35 把考官换成 4 张真人照时，陪练气泡头像一直复用 avExamSrc()。
      本探针钉住「三套分开」：我(avatar)/陪练(coachAvatar 卡通)/考官(examAvatar 真人)。
   ②「这个思考文案换一个，比如让我想想，或者等我想一会之类的，然后每次思考的文案
      最后都不太一样那种，反正就多预设点这种思考文案」
      → 文案池换「让我想想/等我想一会」家族 + 扩充 10 条 + 每次随机。
   全部走真实交互路径（点真tab/真气泡/真选项），不手工塞 innerHTML。
   用法: node tests/_with_server.cjs tests/_probe_coachav_1020.cjs 8871 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8871';
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
async function enterCoach(p) {
  await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await p.evaluate(() => { const t = document.querySelector('#tabs [data-type="PRACTICE"]'); if (t) t.click(); });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const r = await p.evaluate(() => {
      const v = document.getElementById('coachView');
      const img = document.querySelector('#coachView [data-exam-av] img');
      return !!v && !v.hidden && !!img;
    });
    if (r) return true;
  }
  return false;
}

(async () => {
  /* 本机系统代理 127.0.0.1:7897 是死的（HANDOFF §三 网络坑①）→ 直连，线上 BASE 才跑得稳 */
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ===== ① 设置页：弹层三页签 + 陪练网格 2 卡通 + 教官网格 4 真人 ===== */
  {
    const { ctx, p, errs } = await page(b);
    await p.goto(BASE + '/settings.html', { waitUntil: 'domcontentloaded' });
    await sleep(2200);
    await p.click('#acctAvatarBtn').catch(() => {});
    await sleep(900);
    const g = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll('#avatarCard .av-tab')].map(x => x.getAttribute('data-avtab'));
      const coach = document.getElementById('avCoachGrid'), exam = document.getElementById('avExamGrid');
      return {
        tabs,
        coachHidden: coach ? coach.hidden : null,
        coachOpts: coach ? [...coach.querySelectorAll('.av-opt')].map(x => ({
          f: x.getAttribute('data-av'), src: x.querySelector('img').getAttribute('src')
        })) : [],
        examHidden: exam ? exam.hidden : null,
        examOpts: exam ? [...exam.querySelectorAll('.av-opt')].map(x => x.querySelector('img').getAttribute('src')) : [],
        title: (document.getElementById('avPopTitle') || {}).textContent || ''
      };
    });
    /* 10-23 口径更新（T-006 考官不许选）：弹层只剩「我 / 陪练」两个页签，考官网格整块下线 */
    ok('①1 弹层有两个页签 我/陪练（T-006 考官不许选）', JSON.stringify(g.tabs) === JSON.stringify(['user', 'coach']), JSON.stringify(g.tabs));
    ok('①2 陪练网格默认显示（点开头像落在「我」则此项应 false）', g.coachHidden === true, 'coachHidden=' + g.coachHidden);
    ok('①3 弹层里已无考官网格（T-006 下线）', g.examHidden === null, 'examHidden=' + g.examHidden);
    const coachSrcs = g.coachOpts.map(x => x.src).join(',');
    /* 10-23（T-006 陪练扩 8 个）：2 个 → 8 个，前两个是 exam-f/exam-m，后六个 coach-* */
    ok('①4 陪练网格 = 8 个 avataaars 卡通 SVG', g.coachOpts.length === 8
      && g.coachOpts.every(x => /^img\/avatars\/(exam-[fm]|coach-[fm][0-9])\.svg(\?v=[0-9a-z]+)?$/.test(x.src)), 'n=' + g.coachOpts.length + ' ' + coachSrcs);
    ok('①5 教官网格已移除（无 avExamGrid）', g.examHidden === null, 'n=' + g.examOpts.length);

    /* 切到陪练页签 → 选第二个卡通 */
    await p.click('#avatarCard .av-tab[data-avtab="coach"]');
    await sleep(500);
    const t2 = await p.evaluate(() => ({
      coachHidden: document.getElementById('avCoachGrid').hidden,
      title: document.getElementById('avPopTitle').textContent,
      count: document.getElementById('avPopCount').textContent,
      hint: document.getElementById('avPopHint').textContent
    }));
    ok('①6 切「陪练」页签：网格显示 + 标题「换陪练的样子」', t2.coachHidden === false && t2.title === '换陪练的样子', JSON.stringify(t2));
    ok('①7 陪练计数文案「共 8 个形象」', /共\s*8\s*个形象/.test(t2.count), t2.count);

    await p.click('#avCoachGrid .av-opt:nth-child(2)');
    await sleep(600);
    const sel = await p.evaluate(() => ({
      f: DATA.settings.coachAvatar,
      onF: (document.querySelector('#avCoachGrid .av-opt.on') || {}).getAttribute ? document.querySelector('#avCoachGrid .av-opt.on').getAttribute('data-av') : null,
      src: window.avCoachSrc ? window.avCoachSrc() : null,
      examUntouched: DATA.settings.examAvatar
    }));
    ok('①8 点第 2 个卡通 → coachAvatar=exam-m 且选中环跟上', sel.f === 'exam-m' && sel.onF === 'exam-m', JSON.stringify(sel));
    ok('①9 avCoachSrc() 返回卡通 SVG 路径', sel.src === 'img/avatars/exam-m.svg?v=20261020', String(sel.src));
    ok('①10 考官字段不受影响（仍 ex-sophia）', sel.examUntouched === 'ex-sophia', String(sel.examUntouched));

    await p.click('#avPopClose').catch(() => {});
    ok('①11 设置页无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ② 陪练页：气泡头像 = 卡通（默认 exam-f）+ 弹层只出陪练 + 真点切换 ===== */
  {
    const { ctx, p, errs } = await page(b);
    const entered = await enterCoach(p);
    ok('②1 进入口语陪练页', entered);
    const av = await p.evaluate(() => {
      const img = document.querySelector('#coachView [data-exam-av] img');
      return { src: img ? img.getAttribute('src') : null };
    });
    ok('②2 陪练气泡头像默认 = 卡通 exam-f.svg（不是真人照）', av.src === 'img/avatars/exam-f.svg?v=20261020', String(av.src));
    await sleep(900);
    const loaded = await p.evaluate(() => {
      const img = document.querySelector('#coachView [data-exam-av] img');
      return img ? img.naturalWidth : 0;
    });
    ok('②3 卡通图真实加载成功（naturalWidth>0，恢复的 SVG 没坏）', loaded > 0, 'naturalWidth=' + loaded);
    ok('②4 avExamSrc()（考官）仍是真人照，与陪练不同源',
      await p.evaluate(() => window.avExamSrc()) === 'img/examiner/ex-sophia.jpg',
      await p.evaluate(() => window.avExamSrc()));

    /* 点气泡 → 弹层直接落在「陪练」页签 */
    await p.click('#coachView [data-exam-av]').catch(() => {});
    await sleep(900);
    const pop = await p.evaluate(() => {
      const card = document.getElementById('avatarCard');
      const coach = document.getElementById('avCoachGrid'), exam = document.getElementById('avExamGrid');
      return {
        open: !!card && !card.hidden,
        tab: document.body.getAttribute('data-avtab'),
        coachVisible: !!coach && !coach.hidden,
        coachOpts: coach ? coach.querySelectorAll('.av-opt').length : 0,
        examHidden: !!exam && exam.hidden,
        title: (document.getElementById('avPopTitle') || {}).textContent || ''
      };
    });
    ok('②5 点陪练气泡开出弹层', pop.open);
    ok('②6 弹层默认落「陪练」页签（body data-avtab=coach）', pop.tab === 'coach', pop.tab);
    ok('②7 弹层里无考官网格、陪练 8 个卡通', !pop.coachVisible === false && pop.coachOpts === 8, JSON.stringify(pop));

    /* 真点第 2 个卡通 → 全部气泡头像当场刷成 exam-m.svg */
    await p.click('#avCoachGrid .av-opt:nth-child(2)');
    await sleep(1200);
    const after = await p.evaluate(() => {
      const imgs = [...document.querySelectorAll('#coachView [data-exam-av] img')];
      return {
        n: imgs.length,
        srcs: imgs.map(x => x.getAttribute('src')),
        f: DATA.settings.coachAvatar,
        examStill: DATA.settings.examAvatar
      };
    });
    ok('②8 点选后全部气泡头像刷成 exam-m.svg（真实交互路径）',
      after.n >= 1 && after.srcs.every(s => s === 'img/avatars/exam-m.svg?v=20261020') && after.f === 'exam-m',
      'n=' + after.n + ' ' + JSON.stringify(after.srcs));
    ok('②9 考官字段依旧没被带动', after.examStill === 'ex-sophia', String(after.examStill));
    await p.click('#avPopDone').catch(() => {});
    await sleep(400);
    ok('②10 陪练页无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ③ 思考文案：新家族 + 10 条 + 每次随机 + 气泡头像还是卡通 ===== */
  {
    const { ctx, p, errs } = await page(b);
    const entered = await enterCoach(p);
    ok('③1 进入口语陪练页', entered);
    await sleep(600);
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const pool = (typeof window.__COACH_THINKING_TEXTS === 'function' ? window.__COACH_THINKING_TEXTS() : []) || [];
      const texts = [];
      for (let i = 0; i < 12; i++) {
        window.__COACH_SHOW_THINKING();
        await wait(40);
        const t = document.querySelector('.coach-thinking-t');
        texts.push(t ? t.textContent : '');
      }
      const av = document.querySelector('.coach-thinking .coach-av-img');
      /* 收尾：移除思考气泡，不留垃圾 */
      const btn = document.querySelector('#coachSend');
      return {
        pool, texts,
        avSrc: av ? av.getAttribute('src') : null,
        uniq: Array.from(new Set(texts)),
        inPool: texts.every(t => pool.indexOf(t) >= 0),
        oldGone: pool.every(t => !/正在回想|在挑合适的说法|写完就发你|认真答你/.test(t))
      };
    });
    ok('③2 文案池共 10 条', r.pool.length === 10, 'pool=' + JSON.stringify(r.pool));
    ok('③3 全部是「让我想想/等我想一会」家族', r.inPool, JSON.stringify(r.texts.slice(0, 4)));
    ok('③4 旧家族（正在回想你刚说的…等）已清除', r.oldGone);
    ok('③5 每次随机不一样（12 次出现 ' + r.uniq.length + ' 种）', r.uniq.length >= 2, JSON.stringify(r.uniq));
    ok('③6 思考气泡的头像也是卡通（不是真人照）', r.avSrc === 'img/avatars/exam-f.svg?v=20261020', String(r.avSrc));
    ok('③7 陪练页无 JS 报错', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ===== ④ 源码级：同步字段 / 默认值 / 版本串 / mock 教官图 ===== */
  {
    const { ctx, p } = await page(b);
    await p.goto(BASE + '/settings.html', { waitUntil: 'domcontentloaded' });
    const src = await p.evaluate(async () => {
      const get = u => fetch(u).then(r => r.text());
      const [sync, data, sp, mock] = await Promise.all([
        get('js/common-sync.js'), get('js/data.js'), get('speaking.html'), get('js/mock.js')
      ]);
      return {
        /* 10-30 COMMON-JS-SPLIT-1 笔 1：SYNC_SETTINGS_FIELDS 已从 common-sync.js 前移到 js/data.js。
           白名单仍是同一张表（20 个字段，含 coachAvatar），只是换了存放文件 —— 两处任一有即算过。 */
        syncHas: (sync + data).includes("'coachAvatar'"),
        dataHas: /coachAvatar:\s*'exam-f'/.test(data),
        spPicker: /js\/av-picker\.js\?v=2026[0-9]{4}[0-9a-z]?/.test(sp),
        spCoach: /js\/coach\.js\?v=2026[0-9]{4}[0-9a-z]?/.test(sp),
        mockPhotos: ['ex-sophia', 'ex-daniel', 'ex-emily', 'ex-james'].every(k => mock.includes('img/examiner/' + k + '.jpg')),
        mockNoSvg: !/img\/avatars\/exam-/.test(mock)
      };
    });
    ok('④1 coachAvatar 已进 SYNC_SETTINGS_FIELDS（跨设备同步）', src.syncHas);
    ok('④2 data.js 默认 coachAvatar=exam-f', src.dataHas);
    ok('④3 speaking.html 版本串已 bump（av-picker / coach）', src.spPicker && src.spCoach);
    ok('④4 mock.js 教官仍全是真人照、不再引用卡通 SVG', src.mockPhotos && src.mockNoSvg);
    await ctx.close();
  }

  console.log('===== 汇总：' + pass + ' 通过 / ' + fail + ' 有问题 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩溃:', e); process.exit(1); });
