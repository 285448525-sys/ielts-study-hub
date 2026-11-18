/* #8/#9 复盘探针共用：挑一篇「有答案文件」的篇目 + 按真实答案作答
 * 为什么需要：原探针年代里题库只有 68 篇带答案（bank/answers/<id>.json），
 * 列表第一项（Blockbuster）恰好无答案 → 端到端只能得到 13/13 全错，
 * 验不出 .ex-num--hit 的真渲染路径。10-19 答案库已补齐 280/280，但固定篇目与
 * 「按答案填前 N 题 → 同时产生 hit 与 miss」的交叉验证意图继续保留：
 * 固定 2017067274563325954（A Survivor's Story，单选 + 填空，Part 1，13 题）。
 * ⚠️ 只服务本地探针（tests/ 在 .gitignore 内），不入库。
 *
 * 11-15 第六批 PERM-REG-1 探针维修：EXAM-TIMER-CHOICE-1（10-31）后，单篇阅读进场前会问
 * 「要不要计时」；官方旁路键是 localStorage['hub_exam_timer_auto']（js/exam-timer.js:114）。
 * BANK-DONE-ROW-1（11-01）又给做过的篇目加了 #bkDonePick「再看 / 再做一次」弹层。
 * 这里补官方 seed 与弹层处理，保证 openUnit() 仍只做一件事：按列表点开指定篇目进考场。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');

function answersOf(unitId) {
  const p = path.join(ROOT, 'bank/answers', unitId + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).answers || {};
}

/* 给本地进考场探针补官方旁路 + 清「做过了」留痕。
   不污染真实用户路径：这些键只由探针写，页面本身的进场闸一个字没改。 */
async function seedExamBypass(pg) {
  return pg.evaluate(() => {
    try {
      localStorage.setItem('hub_exam_guide_v2_reading', '1');
      localStorage.setItem('hub_exam_guide_v2_listening', '1');
      /* 🔵 11-17 起换成「全局只弹一次」的 hub_exam_guide_once，只写按渠道的 v2 键已经不够 ——
         卡片会照弹，后面所有等考场渲染的步骤全部超时（11-18 一批旧探针就是这么集体变红的）。 */
      localStorage.setItem('hub_exam_guide_once', '1');
      localStorage.setItem('hub_exam_timer_auto', '20');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (/^hub_bank_last_/.test(k || '')) localStorage.removeItem(k);
      }
      return true;
    } catch (e) { return false; }
  });
}

/* 从列表页（已切到阅读 tab、已点 Part）点开指定 unit */
async function openUnit(pg, unitId) {
  await seedExamBypass(pg);
  const parts = ['Part 1', 'Part 2', 'Part 3'];
  for (const p of parts) {
    const tab = await pg.$('#partTabs .pill-tab[data-part="' + p + '"]');
    if (tab) {
      await tab.click();
      await pg.waitForTimeout(500);
      /* 10-24 M-2: list is now grouped (todo/done) + 20 per screen. Target may be #21+ -> click 展开更多 first. */
      let item = await pg.$('.bank-item[data-unit="' + unitId + '"]');
      for (let k = 0; !item && k < 14; k++) {
        const more = await pg.$('.bk-grp[data-grp="todo"] .bk-more, .bk-grp[data-grp="done"] .bk-more');
        if (!more) break;
        await more.click();
        await pg.waitForTimeout(400);
        item = await pg.$('.bank-item[data-unit="' + unitId + '"]');
      }
      if (item) {
        await item.click();
        /* BANK-DONE-ROW-1：做过篇目先弹「查看上次结果 / 再做一次」；本探针要的是做题页，
           所以只在弹层真的出现时点「再做一次」。没弹层时绝不误点。 */
        const redo = await pg.$('#bkDonePick [data-bdp="redo"]');
        if (redo) await redo.click();
        /* 保底：万一一次性闸没生效，卡片已经弹出来了也顺手点掉，别让后面的步骤干等。 */
        const go = await pg.$('.exg-go');
        if (go) await go.click();
        await pg.waitForSelector('#examRoot .ex-group, #examRoot .ex-top', { timeout: 20000 });
        await pg.waitForTimeout(1200);
        return true;
      }
    }
  }
  return false;
}

/* 按答案文件作答：前 nCorrect 题填正确答案，其余留空（必然产生 hit + miss） */
async function answerSome(pg, answers, nCorrect) {
  const pairs = Object.keys(answers).slice(0, nCorrect).map(k => [k, answers[k]]);
  return await pg.evaluate((pairs) => {
    let done = 0, tried = 0;
    for (const [qn, ans] of pairs) {
      tried++;
      const v = String(ans);
      // 单选 / 多选：找同名 input 里 value 相同的
      let el = document.querySelector('#examRoot .ex-radio-box[data-q="' + qn + '"] input[value="' + v + '"]')
        || document.querySelector('#examRoot input.ex-radio[name="exq_' + qn + '"][value="' + v + '"]')
        || document.querySelector('#examRoot input.ex-check[value="' + v + '"]');
      if (el) { el.click(); el.dispatchEvent(new Event('change', { bubbles: true })); done++; continue; }
      // 填空
      const b = document.querySelector('#examRoot input.ex-blank[data-q="' + qn + '"]');
      if (b) { b.value = v; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); done++; continue; }
      // 段落匹配下拉
      const sel = document.querySelector('#examRoot select[data-q="' + qn + '"], #examRoot .ex-lohsel[data-q="' + qn + '"]');
      if (sel) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); done++; continue; }
      // 拖放槽 / 选项池
      const drop = document.querySelector('#examRoot .ex-drop[data-q="' + qn + '"]');
      const chip = document.querySelector('#examRoot .ex-chip[data-v="' + v + '"], #examRoot .ex-pool [data-v="' + v + '"]');
      if (drop && chip) { chip.click(); drop.click(); done++; continue; }
    }
    return { done, tried };
  }, pairs);
}

module.exports = { answersOf, seedExamBypass, openUnit, answerSome };
