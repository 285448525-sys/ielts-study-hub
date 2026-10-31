/* #8/#9 复盘探针共用：挑一篇「有答案文件」的篇目 + 按真实答案作答
 * 为什么需要：题库 280 篇阅读只有 68 篇带答案（bank/answers/<id>.json），
 * 而列表第一项（Blockbuster）恰好无答案 → 端到端只能得到 13/13 全错，
 * 验不出 .ex-num--hit 的真渲染路径。所以固定挑 2017067274563325954（A Survivor's Story,
 * 单选 + 填空，Part 1，13 题、有答案），按答案文件填前 N 题 → 必然同时产生 hit 与 miss。
 * ⚠️ 只服务本地探针（tests/ 在 .gitignore 内），不入库。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');

function answersOf(unitId) {
  const p = path.join(ROOT, 'bank/answers', unitId + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).answers || {};
}

/* 从列表页（已切到阅读 tab、已点 Part）点开指定 unit */
async function openUnit(pg, unitId) {
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
        await pg.waitForSelector('#examRoot', { timeout: 20000 });
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

module.exports = { answersOf, openUnit, answerSome };
