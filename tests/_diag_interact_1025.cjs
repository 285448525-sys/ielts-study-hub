/* 只读体检 2：常见交互路径实测（不写库、不交卷、不删数据）
   跑法：BASE=http://127.0.0.1:9153 NODE_PATH=... node tests/_diag_interact_1025.cjs
   查的是「打开页面看不出来」的那类 bug：点了没反应、切了不生效、返回空白。
   ⚠️ 只做可逆操作（切 tab / 开关面板 / 搜索 / 翻日历），不点保存/删除/交卷。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:9153';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

async function open(b, url, w, h) {
  const ctx = await b.newContext({ viewport: { width: w || 1280, height: h || 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 120)));
  await p.addInitScript(`(function(){ try{
    var K='ielts_study_hub_v1';
    if(!localStorage.getItem(K)) localStorage.setItem(K, JSON.stringify({
      words:[{en:'abandon',level:1,cleared:false,nextReview:'2020-01-01',cn:'放弃'},
             {en:'benefit',level:1,cleared:false,nextReview:'2020-01-01',cn:'好处'}],
      sessions:[], plans:[{date:(function(){var d=new Date();var z=function(n){return String(n).padStart(2,'0')};return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());})(),items:[{id:'a',text:'听力一篇',done:false}]}],
      meds:[], corpus:[], mockRecords:[], deletedIds:[], settings:{}
    }));
    localStorage.setItem('hub_onboarding_v2', JSON.stringify({finished:true, entered:true, snoozed:true}));
  }catch(e){} })();`);
  await p.goto(BASE + '/' + url, { waitUntil: 'load', timeout: 25000 });
  await p.waitForFunction(() => { const l = document.getElementById('bootLoader'); return !l || l.classList.contains('hide') || getComputedStyle(l).display === 'none'; }, null, { timeout: 12000 }).catch(() => {});
  await p.evaluate(() => { const o = document.getElementById('onbOverlay'); if (o) o.remove(); });
  await sleep(1200);
  return { p, ctx, errs };
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ① 模考页四科 tab 切换 */
  console.log('===== ① 模考页 tab 切换 =====');
  {
    const { p, ctx, errs } = await open(b, 'bank.html');
    for (const t of ['listening', 'writing', 'speaking', 'reading']) {
      await p.evaluate((tab) => { const el = document.querySelector('#mockTabs [data-mtab="' + tab + '"]'); if (el) el.click(); }, t);
      await sleep(900);
      const r = await p.evaluate((tab) => {
        const pane = document.getElementById('pane-' + tab);
        const list = document.querySelector('#pane-' + tab + ' .bank-items, #pane-' + tab + ' [class*="list"], #pane-' + tab + ' .mock-pane-inner');
        return { hidden: pane ? pane.hidden : null, textLen: pane ? (pane.innerText || '').trim().length : 0 };
      }, t);
      ok('切到 ' + t + '：面板可见且有内容', r.hidden === false && r.textLen > 20, r);
    }
    ok('零 pageerror（模考页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  /* ② 单词页：答一题有反馈（W-3 那条的回归） */
  console.log('\n===== ② 单词页答题反馈 =====');
  {
    const { p, ctx, errs } = await open(b, 'practice.html');
    await sleep(1500);
    const before = await p.evaluate(() => ({ cn: (document.getElementById('pwCn') || {}).textContent || '', opts: document.querySelectorAll('.abtn, .answer-btns button, [data-opt]').length }));
    const clicked = await p.evaluate(() => {
      const btn = document.querySelector('.abtn, .answer-btns button, [data-opt]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    await sleep(700);
    const after = await p.evaluate(() => ({
      cn: (document.getElementById('pwCn') || {}).textContent || '',
      marked: document.querySelectorAll('.correct, .wrong').length
    }));
    console.log('  点选项前：', JSON.stringify(before), '点后：', JSON.stringify(after));
    ok('能点到选项', clicked === true);
    ok('★ 点完有对/错反馈（.correct 或 .wrong 出现）', after.marked > 0, after.marked);
    ok('零 pageerror（单词页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  /* ③ 回顾页三个分栏 */
  console.log('\n===== ③ 回顾页分栏切换 =====');
  {
    const { p, ctx, errs } = await open(b, 'review.html');
    const tabs = await p.evaluate(() => Array.from(document.querySelectorAll('.review-pill-tabs .pill-tab, #reviewTabs .pill-tab, .tabs .pill-tab')).map(b => b.textContent.trim()));
    console.log('  分栏：', JSON.stringify(tabs));
    let switched = 0, empty = 0;
    for (let i = 0; i < tabs.length; i++) {
      await p.evaluate((idx) => {
        const bs = document.querySelectorAll('.review-pill-tabs .pill-tab, #reviewTabs .pill-tab, .tabs .pill-tab');
        if (bs[idx]) bs[idx].click();
      }, i);
      await sleep(800);
      const r = await p.evaluate(() => {
        const on = document.querySelector('.tab-panel.active');
        /* 🔵 RV-CLEAN-1（10-26）：成绩栏的**内容已搬到 .rvx-page**（E 版骨架），
           它刻意放在 #tab-score 之外、靠 `.review-wrap:has(#tab-score.active) ~ .rvx-page` 联动显示，
           而 #tab-score 里剩下的 8 个旧面板被整块藏掉（她 18:2x「下面老的东西全部删掉」）。
           → 判「这一栏是不是空白」必须把 .rvx-page 的可见文字算进来，否则会假红。
           顺带把「切到了哪一栏」也记下来，以后看日志知道是哪栏出的问题。 */
        const rvx = document.querySelector('.rvx-page');
        const rvxVisible = rvx && rvx.checkVisibility && rvx.checkVisibility();
        const ownLen = on ? (on.innerText || '').trim().length : 0;
        const rvxLen = rvxVisible ? (rvx.innerText || '').trim().length : 0;
        return { active: !!on, id: on ? on.id : null, textLen: ownLen + rvxLen, rvxLen: rvxLen };
      });
      if (r.active) switched++;
      if (r.active && r.textLen < 10) { empty++; console.log('     空白栏：' + r.id + ' own+rvx=' + r.textLen); }
    }
    ok('每个分栏都能切出面板（' + switched + '/' + tabs.length + '）', switched === tabs.length, switched);
    ok('没有切出空白面板', empty === 0, empty);
    ok('零 pageerror（回顾页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  /* ④ 设置页四组导航 */
  console.log('\n===== ④ 设置页分组导航 =====');
  {
    const { p, ctx, errs } = await open(b, 'settings.html');
    const navs = await p.evaluate(() => Array.from(document.querySelectorAll('.set-nav-item')).map(b => b.getAttribute('data-goto')));
    console.log('  导航：', JSON.stringify(navs));
    let okAll = true;
    for (const g of navs) {
      if (!g) continue;
      await p.evaluate((g2) => { const el = document.querySelector('.set-nav-item[data-goto="' + g2 + '"]'); if (el) el.click(); }, g);
      await sleep(600);
      const r = await p.evaluate((g2) => {
        const pane = document.querySelector('.set-pane[data-pane="' + g2 + '"]');
        return pane ? !pane.hidden && (pane.innerText || '').trim().length > 20 : false;
      }, g);
      if (!r) { okAll = false; console.log('    ⚠️ 分组 ' + g + ' 切不出来'); }
    }
    ok('★ 四个分组都能切出内容', okAll === true, navs);
    ok('零 pageerror（设置页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  /* ⑤ 计划页这两天改过（P-1R2 接真数据），重点看 */
  console.log('\n===== ⑤ 计划页（P-1R2 刚接过数据）=====');
  {
    const { p, ctx, errs } = await open(b, 'plans.html');
    const r = await p.evaluate(() => {
      const today = document.getElementById('ptabToday');
      const body = document.querySelector('.m-page');
      return {
        todayVisible: today ? getComputedStyle(today).display !== 'none' : null,
        taskRows: document.querySelectorAll('.m-task').length,
        phaseBar: document.querySelector('.m-phase') ? (document.querySelector('.m-phase').innerText || '').trim().slice(0, 40) : null,
        hasFakeData: (document.body.innerText || '').indexOf('6.5') >= 0 && (document.body.innerText || '').indexOf('83 天') >= 0,
        textLen: (body ? body.innerText : '').trim().length
      };
    });
    console.log('  计划页：', JSON.stringify(r));
    ok('今日面板可见且有内容', r.todayVisible === true && r.textLen > 30, r.textLen);
    ok('★ 没有写死的假数据残留（6.5 / 83 天）', r.hasFakeData === false, r.hasFakeData);
    ok('零 pageerror（计划页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  /* ⑥ 全站软导航（站内跳页）不空白 */
  console.log('\n===== ⑥ 站内跳页（软导航）=====');
  {
    const { p, ctx, errs } = await open(b, 'home.html');
    const targets = ['bank.html', 'speaking.html', 'practice.html', 'review.html', 'home.html'];
    let good = 0;
    for (const t of targets) {
      await p.evaluate((f) => { if (typeof hubSoftGo === 'function') hubSoftGo(f); else location.href = f; }, t);
      await sleep(2200);
      /* 🔴 判据修正（第一版误报过 practice.html）：**不能用 innerText 长度判「有没有内容」** ——
         practice 页的题干/选项是卡片式布局，innerText 只回了 29 字（整页 69 字），
         但截图看是完全正常的（单词 abandon + 两个选项 + 0/2 进度都在）。
         改用「结构判据」：main 里可见元素数 + 是否有可见的文字节点，两者都非空才算有内容。 */
      const r = await p.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return { visEls: 0, visText: 0, innerLen: 0, url: location.pathname };
        const els = Array.from(main.querySelectorAll('*')).filter(e => {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          const r2 = e.getBoundingClientRect();
          return r2.width > 0 && r2.height > 0;
        });
        const visText = els.filter(e => Array.from(e.childNodes).some(c => c.nodeType === 3 && c.nodeValue.trim())).length;
        return { visEls: els.length, visText, innerLen: main.innerHTML.length, url: location.pathname };
      });
      if (r.visEls > 20 && r.visText > 3) good++;
      else console.log('    ⚠️ 跳到 ' + t + ' 后：可见元素 ' + r.visEls + ' · 可见文字节点 ' + r.visText);
    }
    ok('★ 五步跳页每步都有内容（' + good + '/' + targets.length + '）', good === targets.length, good);
    ok('零 pageerror（跳页）', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  await b.close();
  console.log('\n===== 汇总 ' + pass + ' 过 / ' + fail + ' 红 =====');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
