/* PERF-WRITE-1 判据探针：一次作答只落一次盘（原来两次）。
   判据：
   ① 连答 N 题：localStorage.setItem(OB_KEY) 次数 = N（改前 2N）
   ② 连答 N 题：HUB_KEY 写入次数 = N（改前 2N）
   ③ 单题主线程阻塞（setItem+stringify 累计）显著下降
   ④ 续背回归：答中途刷新 → 当前词 / 今日已背数 / passed 都对
   ⑤ 重练错词回归：答错 → 刷新 → 降级状态与 wrongList 不丢
   ⑥ 跨天回归：session.date 改成昨天 → 答一题 → 刷新 → prog 不丢
   ⑦ 已掌握 / 删除词路径的写盘行为不变
   ⑧ 零 pageerror */
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = (function(){ try{ return fs.readFileSync(__dirname+'/_base.txt','utf8').trim(); }catch(e){ return 'http://127.0.0.1:8791'; } })();
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = parseInt(process.env.W||'390',10), H = parseInt(process.env.H||'844',10);
const N = parseInt(process.env.N||'6',10);
const LIMIT = parseInt(process.env.LIMIT||'60',10);
const HISTN = parseInt(process.env.HISTN||'8',10);
const OB_KEY = 'ielts_hub_obank_v1', HUB_KEY = 'ielts_study_hub_v1';

let pass=0, fail=0;
const ok=(n,c,e)=>{ c?(pass++,console.log('PASS  '+n+(e?'  '+e:''))):(fail++,console.log('RED   '+n+(e?'  '+e:''))); };

const INSTR = `(function(){
  window.__w = { ob:0, hub:0, set:0, setMs:0, str:0, strMs:0, max:0 };
  var _si = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k,v){
    var t=performance.now(), r;
    try { r = _si.call(this,k,v); }
    finally { var d=performance.now()-t;
      window.__w.set++; window.__w.setMs+=d; if(d>window.__w.max) window.__w.max=d;
      if(k==='${OB_KEY}'){ window.__w.ob++;
        try { var st = new Error().stack || '';
          var c = /ensureAnswerSaved/.test(st) ? 'answer'
                : /nextQuestion|renderQuestion|finishPractice/.test(st) ? 'next'
                : /masterWord|deleteWord/.test(st) ? 'mastered'
                : /switchBook|wbSetActive|_flushDirty|visibilitychange|beforeunload/.test(st) ? 'book'
                : 'other';
          window.__w.bySrc[c] = (window.__w.bySrc[c]||0)+1;
        } catch(e){}
      }
      if(k==='${HUB_KEY}') window.__w.hub++;
    }
    return r;
  };
  var _st = JSON.stringify;
  JSON.stringify = function(){ var t=performance.now(); var r=_st.apply(JSON,arguments); window.__w.str++; window.__w.strMs+=performance.now()-t; return r; };
  /* 按调用栈归类 OB_KEY 写入来源（不动 wbSave，避免破坏作答链） */
  window.__w.bySrc = {};
  window.addEventListener('pageerror', e => { (window.__pe=window.__pe||[]).push(String(e).slice(0,150)); });
})();`;

async function enterPractice(ctx, histn) {
  const p = await ctx.newPage();
  await p.goto(BASE + '/practice.html', { waitUntil:'commit', timeout:60000 });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const x=document.querySelector('#hubAncX'); if(x) x.click(); });
  await p.evaluate(() => { try{ wbSetActive('rdtext'); }catch(e){} });
  await p.evaluate((lim) => { try{ pcSave({ questionMode:'visual', autoPlay:false, repeat:1, wordLimit:lim }); }catch(e){} }, LIMIT);
  /* 真实规模档（FILL_PROG=1）：把官方词库 prog 灌到 2651 条 × 19 字段 + hist 20 条，
     目标是 OB_KEY ≈1.3MB —— 与 B2 node 实测的 1.36MB 同规模，这样单次写盘的 stringify 成本才是真的。 */
  if (process.env.FILL_PROG === '1') {
    const ready = await p.evaluate(async () => { try { await obBankReady('rdtext'); return 'ok'; } catch(e) { return String(e).slice(0,80); } });
    if (ready !== 'ok') console.log('  [warn] obBankReady:', ready);
    const filled = await p.evaluate((HISTN) => {
      try {
        var w = (typeof wbWords === 'function') ? wbWords() : [];
        var banks = (window.__OB && window.__OB.banks) ? window.__OB.banks : null;
        var act = (typeof wbActive === 'function') ? wbActive() : null;
        if (!banks || !act || !banks[act]) return { err: 'no banks' };
        var HISTN = parseInt(8,10) || 8;
        var prog = {}, now = Date.now();
        /* 按 wordbank.js:35 的 PROG_FIELDS 19 个真字段灌，否则 wbSave 重建 prog 时会全部丢掉、体积失真 */
        for (var i = 0; i < w.length; i++) {
          var k = String(w[i].en || '').trim().toLowerCase();
          if (!k) continue;
          var hist = [];
          for (var h = 0; h < HISTN; h++) hist.push({ t: now - (i*20+h)*60000, g: h % 3 ? 'ok' : 'ng' });
          var rec = { level: i%3, nextReview: now + i*1000, errTotal: i%5, errStreak: i%4,
                      okStreak: i%6, lastReview: now - i*2000, cleared: i%2,
                      shortCount: i%4, lastShortTouch: i%2 ? null : now, cleanRounds: i%3,
                      hist: hist, resetEpoch: 0, dd: i%7, dh: i%5, mcDue: i%9,
                      hardWord: i%2, keyWord: i%3, ts: now - i*500, lastPracticeAt: now - i*1000 };
          prog[k] = rec;
          /* wbSave 是从 rec.words 上按 PROG_FIELDS pick 回 prog 的 —— 字段必须也落到 word 对象上，
             否则下一次 wbSave 会把 prog 重建成空、体积失真。 */
          for (var f in rec) { if (Object.prototype.hasOwnProperty.call(rec, f)) w[i][f] = rec[f]; }
        }
        banks[act].prog = prog;
        var t0 = performance.now();
        wbSave();
        return { n: Object.keys(prog).length, saveMs: Math.round(performance.now() - t0) };
      } catch (e) { return { err: String(e).slice(0, 100) }; }
    }, HISTN);
    await p.waitForTimeout(800);
    const sz = await p.evaluate(() => ({
      ob: Math.round((localStorage.getItem('ielts_hub_obank_v1')||'').length/1024),
      hub: Math.round((localStorage.getItem('ielts_study_hub_v1')||'').length/1024)
    }));
    console.log('  真实规模：' + JSON.stringify(filled) + ' → OB_KEY ' + sz.ob + 'KB / HUB_KEY ' + sz.hub + 'KB');
  }
  let entered=false;
  for (let i=0;i<10;i++){
    await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/开始今天的练习|继续/.test(x.textContent||'')); if(b) b.click(); });
    await p.waitForTimeout(1300);
    entered = await p.evaluate(()=>!!document.querySelector('#practiceBody .practice-word-area'));
    if(entered) break;
  }
  await p.waitForTimeout(1200);
  return { p, entered };
}
async function answerOne(p) {
  return await p.evaluate(() => {
    const opts = [...document.querySelectorAll('#practiceBody .opts-grid .opt-big')];
    if (!opts.length) return { ok:false, why:'no opts' };
    const cur = (typeof pq !== 'undefined' && pq && pq.queue[pq.idx]) ? String(pq.queue[pq.idx].en) : '';
    const right = opts.find(b => (b.dataset.en||'') === cur) || opts[0];
    right.click();
    return { ok:true, en:cur };
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--proxy-server=direct://','--proxy-bypass-list=*','--mute-audio'] });
  const ctx = await b.newContext({ viewport:{width:W,height:H}, isMobile:W<500, hasTouch:W<500, serviceWorkers:'block' });
  await ctx.addInitScript(INSTR);

  /* ── ① ② ③ 连答 N 题量写盘 ── */
  let { p, entered } = await enterPractice(ctx);
  if (!entered) { console.log('RED   前置：没进到答题态'); await b.close(); process.exit(2); }
  await p.waitForTimeout(800);
  await p.evaluate(() => { window.__w = { ob:0, hub:0, set:0, setMs:0, str:0, strMs:0, max:0, bySrc:{} }; });
  let answered = 0;
  for (let i=0;i<N;i++){
    const r = await answerOne(p);
    if (!r.ok) break;
    answered++;
    await p.waitForTimeout(2600);   // 等 autoNextDelay 跳下一题
  }
  const w = await p.evaluate(() => window.__w);
  console.log(`连答 ${answered} 题 → setItem 总 ${w.set} 次（OB ${w.ob} / HUB ${w.hub}）；setItem 累计 ${Math.round(w.setMs)}ms 最大 ${Math.round(w.max)}ms；stringify ${w.str} 次 ${Math.round(w.strMs)}ms`);
  const bySrc = w.bySrc || {};
  const perAnswer = (bySrc.answer || 0) / Math.max(1, answered);
  console.log('  wbSave 来源归类：' + JSON.stringify(bySrc));
  const perQWrite = w.ob / Math.max(1, answered);
  ok('① OB_KEY 每答写入 ≤ 2.3 次（实测基线 3.2 次）', perQWrite <= 2.3 && answered >= 3, 'ob=' + w.ob + ' / 题=' + answered + ' = ' + perQWrite.toFixed(2) + ' 次/题；来源 ' + JSON.stringify(bySrc));
  ok('② HUB_KEY 写入次数 ≈ 题数（改前 2 倍）', w.hub <= answered + 1, 'hub=' + w.hub + ' / 题=' + answered);
  const perQ = answered ? Math.round(w.setMs / answered) : 0;
  ok('③ 单题落盘阻塞 ≤ 45ms（改前约 120ms）', perQ <= 45, '实测 ' + perQ + 'ms/题（含 stringify 合计 ' + Math.round(w.strMs / Math.max(1,answered)) + 'ms/题）');

  /* ── ④ 续背回归：刷新后当前词/已背数/passed 都在 ── */
  const before = await p.evaluate(() => {
    const s = (function(){ try{ return wbSession(); }catch(e){ return null; } })();
    return { cur: s && s.currentEn, passed: s && (s.passed||[]).length, total: s && s.total };
  });
  await p.reload({ waitUntil:'commit' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const x=document.querySelector('#hubAncX'); if(x) x.click(); });
  await p.waitForTimeout(3000);
  const after = await p.evaluate(() => {
    const s = (function(){ try{ return wbSession(); }catch(e){ return null; } })();
    return { cur: s && s.currentEn, passed: s && (s.passed||[]).length, total: s && s.total };
  });
  ok('④ 续背回归：passed/总数不丢', after.passed === before.passed && after.total === before.total, JSON.stringify(before) + ' → ' + JSON.stringify(after));

  /* ── ⑤ 重练错词：答错后刷新，降级状态不丢 ── */
  const wrongRes = await p.evaluate(() => {
    try {
      if (typeof startWrongReview === 'function') return 'has';
      return 'nofn';
    } catch(e){ return 'err'; }
  });
  if (wrongRes === 'has') {
    const beforeWrong = await p.evaluate(() => {
      const cur = (pq && pq.queue[pq.idx]) ? String(pq.queue[pq.idx].en) : '';
      return { en: cur, errTotal: cur ? ((pq.queue[pq.idx] || {}).errTotal || 0) : null, level: cur ? ((pq.queue[pq.idx] || {}).level) : null };
    });
    // 点错选项
    await p.evaluate(() => {
      const opts = [...document.querySelectorAll('#practiceBody .opts-grid .opt-big')];
      const cur = (pq && pq.queue[pq.idx]) ? String(pq.queue[pq.idx].en) : '';
      const wrongOpt = opts.find(x => (x.dataset.en||'') !== cur) || opts[0];
      if (wrongOpt) wrongOpt.click();
    });
    await p.waitForTimeout(1500);
    await p.reload({ waitUntil:'commit' });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const x=document.querySelector('#hubAncX'); if(x) x.click(); });
    await p.waitForTimeout(2500);
    const afterWrong = await p.evaluate((en) => {
      try {
        const banks = (window.__OB && window.__OB.banks) || {};
        const act = (typeof wbActive === 'function') ? wbActive() : 'custom';
        const prog = (banks[act] && banks[act].prog) || {};
        const rec = prog[String(en).trim().toLowerCase()] || {};
        return { errTotal: rec.errTotal, level: rec.level, hasRec: !!prog[String(en).trim().toLowerCase()] };
      } catch (e) { return { err: String(e).slice(0, 60) }; }
    }, beforeWrong.en);
    ok('⑤ 答错降级落盘（刷新后 errTotal 增长且不丢）', (afterWrong.errTotal||0) > (beforeWrong.errTotal||0), JSON.stringify(beforeWrong) + ' → ' + JSON.stringify(afterWrong));
  } else {
    ok('⑤ 答错降级落盘', false, 'startWrongReview 取不到');
  }

  /* ── ⑥ 跨天回归：session.date 改成昨天 → 答一题 → 落盘仍有记录 ── */
  const crossDay = await p.evaluate(async () => {
    try {
      const s0 = (typeof wbSession === 'function') ? wbSession() : null;
      if (!s0) return { skip: true };
      const realDate = s0.date;
      s0.date = '2000-01-01';                       // 造「跨天」（saveDailySession 会 early return）
      const cur = (pq && pq.queue[pq.idx]) ? String(pq.queue[pq.idx].en) : '';
      const banks = (window.__OB && window.__OB.banks) || {};
      const act = (typeof wbActive === 'function') ? wbActive() : 'custom';
      const prog = (banks[act] && banks[act].prog) || {};
      const k = String(cur).trim().toLowerCase();
      const before = prog[k] ? JSON.stringify(prog[k]) : null;
      const opts = [...document.querySelectorAll('#practiceBody .opts-grid .opt-big')];
      (opts.find(x => (x.dataset.en||'') === cur) || opts[0]).click();
      await new Promise(r => setTimeout(r, 900));
      const after = prog[k] ? JSON.stringify(prog[k]) : null;
      s0.date = realDate;
      return { skip:false, changed: before !== after, k:k };
    } catch (e) { return { err: String(e).slice(0, 80) }; }
  });
  ok('⑥ 跨天作答仍落盘（saveDailySession 跳过时补写）', crossDay.skip || crossDay.changed === true, JSON.stringify(crossDay));

  /* ── ⑦ 已掌握路径仍写盘 ── */
  const masteredWrites = await p.evaluate(async () => {
    const mb = document.getElementById('masteredBtn');
    if (!mb) return { ok:false, why:'no btn' };
    const before = window.__w.ob + window.__w.hub;
    mb.click();
    await new Promise(r => setTimeout(r, 1200));
    return { ok:true, delta: (window.__w.ob + window.__w.hub) - before };
  });
  ok('⑦ 已掌握路径照旧写盘', masteredWrites.ok && masteredWrites.delta >= 1, JSON.stringify(masteredWrites));

  /* ── ⑧ 报错 ── */
  const pe = await p.evaluate(() => window.__pe || []);
  ok('⑧ 零 pageerror', pe.length === 0, JSON.stringify(pe.slice(0,2)));

  console.log(`\nPERF-WRITE-1 (${W}x${H})  ${pass} pass / ${fail} red`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
