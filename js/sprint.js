/* 首页 · 考前冲刺卡（9/30 新增）
   只在距考试 ≤14 天时出现，考完（daysLeft < 0）自动消失，不设考试日期则不出现。

   为什么要有它：原首页只回答「今天学多久 / 背几个词 / 任务清单」，是长期积累型的设计。
   但 9 天后就要机考的人每天打开首页真正想知道的是另外四件事：
     1. 我离目标分还差多少
     2. 四科各练了多少、哪一科荒废了（自学最容易偏科而不自知）
     3. 今天该先练哪一科
     4. 考前一天 / 当天该做什么、机考和纸笔有什么不一样
   本卡只回答这四个问题，不重复首页已有的倒计时 / 时长 / 待学词 / 任务清单。

   约束：只读 DATA，不写库、不新增任何 DATA 字段（因此不需要动 mergeData）。
   依赖全局：DATA、MODULES、ready、todayKey、examCountdown、escapeHtml。 */
(function () {
  const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
  const LABEL = { vocab: '词汇', listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function last7Keys() {
    const out = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) out.push(ymd(new Date(now.getTime() - i * 86400000)));
    return out;
  }

  /* session.moduleId 通常是顶层 id（vocab / listening / …），但历史数据里也可能存了子 id
     （如 vocab_review）——两种都归一到顶层，否则四科统计会漏。 */
  function topOf(id) {
    if (!id) return null;
    if (LABEL[id]) return id;
    try {
      for (const m of MODULES) {
        if (m.children && m.children.some(c => c.id === id)) return m.id;
      }
    } catch (e) {}
    return null;
  }

  function weekMinutes() {
    const keys = last7Keys();
    const by = { vocab: 0, listening: 0, reading: 0, writing: 0, speaking: 0 };
    const list = (DATA && DATA.sessions) || [];
    for (const s of list) {
      if (!s || keys.indexOf(s.date) < 0) continue;
      const t = topOf(s.moduleId);
      if (t && by[t] != null) by[t] += Number(s.durationSec) || 0;
    }
    const out = {};
    Object.keys(by).forEach(k => { out[k] = Math.round(by[k] / 60); });
    return out;
  }

  function minsText(m) {
    if (!m) return '0 分钟';
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' 小时' + (r ? ' ' + r + ' 分' : '');
  }

  function phaseOf(d) {
    if (d === 0) return '今天考';
    if (d === 1) return '明天考';
    if (d <= 3) return '临考前';
    if (d <= 7) return '最后一周';
    return '冲刺期';
  }

  /* 目标分 vs 近期成绩平均分（DATA.scores：回顾页「成绩」tab 录入的四科分数）。
     10/1 她拍板：不能用「最近一次」当现在的水平（成绩随时间在变），要用**近期成绩的平均分**。
     口径：按日期取最近 GAP_N 条记录，各科只平均录了分的那些条；N 写在卡片副标题上，随时可调。
     10/1 修：① tip 的天数动态；② 没录分的科不参与对比；③ 只设总分时给「补单科目标」提示。 */
  var GAP_N = 3;
  function recentAvgs() {
    const list = ((DATA && DATA.scores) || []).slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, GAP_N);
    const avg = {};
    SKILLS.forEach(k => {
      const vals = list.map(r => Number(r && r[k])).filter(v => v > 0);
      avg[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    return { used: list.length, avg: avg };
  }
  function renderGap(d) {
    const tg = ((DATA && DATA.settings) && DATA.settings.targets) || {};
    const anyScore = ((DATA && DATA.scores) || []).length > 0;
    const hasTarget = SKILLS.some(k => Number(tg[k]) > 0) || Number(tg.overall) > 0;

    if (!anyScore) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">还没录过成绩。先做一套模考、把四科分填进'
        + '<a href="review.html">回顾页</a>，这里才会显示差距。</p>'
        + '</div>';
    }
    if (!hasTarget) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">还没设目标分，去<a href="settings.html">设置</a>填一下，这里会按科算差距。</p>'
        + '</div>';
    }

    const rec = recentAvgs();
    let rows = '';
    let worst = null;
    SKILLS.forEach(k => {
      const t = Number(tg[k]) || 0;
      const got = rec.avg[k];
      if (got == null) return;                 // 近期没录过这一科的分就不比（0 不是真实成绩）
      if (!t) return;                          // 没设这科的目标也没法比
      const diff = Math.round((got - t) * 10) / 10;
      if (worst === null || diff < worst.diff) worst = { k: k, diff: diff };
      const cls = diff >= 0 ? 'ok' : (diff >= -0.5 ? 'near' : 'bad');
      const dtxt = diff > 0 ? ('超 ' + diff.toFixed(1)) : (diff === 0 ? '持平' : ('差 ' + Math.abs(diff).toFixed(1)));
      rows += '<div class="sp-gap-row">'
        + '<span class="sp-gap-k">' + LABEL[k] + '</span>'
        + '<span class="sp-gap-bar"><i class="' + cls + '" style="width:' + Math.min(100, Math.round(got / 9 * 100)) + '%"></i></span>'
        + '<span class="sp-gap-v">' + got.toFixed(1) + '<em>/' + (t ? t.toFixed(1) : '—') + '</em></span>'
        + '<span class="sp-gap-d ' + cls + '">' + dtxt + '</span>'
        + '</div>';
    });
    if (!rows) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">只设了总分，单科目标没填或近期成绩没录分，按科比不了。去'
        + '<a href="settings.html">设置</a>把单科目标补上更直观。</p>'
        + '</div>';
    }
    // 剩多少天说多少天，别写死天数
    const tip = (worst && worst.diff < 0)
      ? (d > 1
        ? '<p class="sp-tip">最大缺口是<b>' + LABEL[worst.k] + '</b>（差 ' + Math.abs(worst.diff).toFixed(1) + ' 分）——最后 ' + d + ' 天优先砸它，性价比最高。</p>'
        : '<p class="sp-tip">最大缺口是<b>' + LABEL[worst.k] + '</b>（差 ' + Math.abs(worst.diff).toFixed(1) + ' 分）——没时间补了，考场上先做有把握的题，别恋战。</p>')
      : '<p class="sp-tip">都已达标，保持手感就行，别在最后几天换方法。</p>';
    const sub = '按最近 ' + rec.used + (rec.used >= 2 ? ' 次平均' : ' 次成绩');
    return '<div class="sp-card">'
      + '<div class="sp-card-h">离目标还差多少<span class="sp-card-sub">' + sub + '</span></div>'
      + rows + tip + '</div>';
  }

  /* 近 7 天四科练习分布 + 最弱科提示 */
  function renderSpread() {
    const by = weekMinutes();
    const max = Math.max.apply(null, Object.keys(by).map(k => by[k]).concat([1]));
    let rows = '';
    Object.keys(by).forEach(k => {
      const m = by[k];
      const pct = Math.round(m / max * 100);
      const zero = m === 0;
      rows += '<div class="sp-sp-row' + (zero ? ' zero' : '') + '">'
        + '<span class="sp-sp-k">' + LABEL[k] + '</span>'
        + '<span class="sp-sp-bar"><i style="width:' + (zero ? 0 : Math.max(4, pct)) + '%"></i></span>'
        + '<span class="sp-sp-v">' + (zero ? '0' : minsText(m)) + '</span>'
        + '</div>';
    });
    return '<div class="sp-card">'
      + '<div class="sp-card-h">近 7 天练了什么<span class="sp-card-sub">按计时记录</span></div>'
      + rows + '</div>';
  }

  /* 「今天先练：XX」整块已删（10/1 她拍板：不要网站指挥今天练什么，她有自己的节奏）。
     同批删掉的还有配套的 GO/GO_TEXT 跳转表与 why 文案。 */

  /* 机考须知 / 考前清单。只写确定的规则（官方口径），不确定的一律不写。
     10/1 她拍板：**真的到了考前一周（≤7 天）才显示**，第 8 天及更早不出现；
     ≤2 天切成「考前一天 / 当天」视角；≤3 天默认展开。 */
  function checklist(d) {
    if (d > 7) return '';
    const week = [
      ['写作改成打字', 'Task 1 至少 150 词 / 20 分钟，Task 2 至少 250 词 / 40 分钟。机考屏幕上会实时显示字数，但<b>时间到会自动收卷</b>，先在草稿上列提纲再动手。'],
      ['听力只有 2 分钟检查', '机考听力结束后给 2 分钟检查拼写（纸笔是 10 分钟），没有时间回头大改。'],
      ['阅读没有誊写时间', '答案直接点选/输入，省了誊答题卡的 10 分钟，但也意味着不能最后统一改答案。'],
      ['每天一套完整模考', '听力+阅读+写作连着做，练的是连续 2 小时 45 分钟的体力，不是单科正确率。'],
      ['口语可能在另一天', '机考口语通常安排在笔试当天或前后几天，以考点通知为准。']
    ];
    const eve = [
      ['证件和准考证', '报名用哪个证件就带哪个（身份证 / 护照），准考证提前打印好。'],
      ['提前 30 分钟到', '迟到不能进，也没法补考。先查好考点地址和路线，算上堵车。'],
      ['今晚别练新题', '过一遍错词、P2 高频题、写作模板就够了。临时塞新东西只会让你慌。'],
      ['考场上先做设备测试', '耳机音量和屏幕亮度开考前有测试环节，别跳过。'],
      ['出分是 3–5 天', '机考一般 3–5 天出成绩，比纸笔快很多。']
    ];
    const list = d <= 2 ? eve : week;
    const title = d <= 2 ? '考前一天 / 当天' : '考前一周 · 机考须知';
    let html = '';
    list.forEach(x => {
      html += '<div class="sp-ck-item"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
    });
    return '<details class="sp-ck"' + (d <= 3 ? ' open' : '') + '>'
      + '<summary class="sp-ck-sum">' + title + '<span class="sp-ck-n">' + list.length + ' 条</span></summary>'
      + '<div class="sp-ck-body">' + html
      + '<p class="sp-ck-note">以上是 IELTS 官方机考的通用规则，具体以你收到的考点通知为准。</p>'
      + '</div></details>';
  }

  function render() {
    const host = document.getElementById('dashSprint');
    if (!host) return;
    try {
      const cd = (typeof examCountdown === 'function') ? examCountdown() : null;
      const d = cd ? cd.daysLeft : null;
      // 只在「有考试日期 且 0 ≤ 剩余天数 ≤ 14」时出现；考完/没设日期 → 整个卡不渲染
      if (d === null || d < 0 || d > 14) { host.innerHTML = ''; host.hidden = true; return; }
      host.hidden = false;
      host.innerHTML =
        '<div class="sp-head">'
        + '<span class="sp-days">' + d + '<em>天</em></span>'
        + '<span class="sp-head-t">距考试 ' + d + ' 天 · ' + phaseOf(d) + '</span>'
        + '<a class="sp-head-a" href="settings.html">改日期</a>'
        + '</div>'
        + '<div class="sp-grid">' + renderGap(d) + renderSpread() + '</div>'
        + checklist(d);
    } catch (e) {
      console.warn('sprint render failed', e);
      host.innerHTML = ''; host.hidden = true;
    }
  }

  ready(function () { render(); });
  // 云端合并后数据可能变（比如另一台设备刚录了成绩），重渲一次
  document.addEventListener('hub:data-merged', function () { render(); });
  document.addEventListener('hub:session-saved', function () { render(); });
  window.renderSprint = render;
})();
