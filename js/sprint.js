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

  /* 目标分 vs 当前水平（10/1 她拍板 v2）：数据源 = 回顾页「分项记录列表」DATA.mockRecords（她自己导入的数字）。
     旧版用 DATA.scores（成绩 tab 手录，只有 8 月两条旧数据）→ 听力显示 4.5 被她抓包，口径报废。
     窗口 = 最近 7 天（含今天）。算法（她设计的，要求"最精准"）：
     - 听/读：按 part 分桶——整卷拆开、单项各自进桶；每桶「Σ答对 ÷ 考试次数」= 该 part 平均答对数；
       Σ各 part 平均 = 虚拟整卷总答对数 → 按比例折 40 查 band 表得档位。
     - 写作：Task 1 平均、Task 2 平均，再按权重（T1×1、T2×2）合成（与列表「均分」口径一致）。
     - 口语：口语页整卷模考（kind==='speaking'，自动存）直接取 overall；手动录的四维单项按权重合成。
     - 7 天内该科无数据 → 回退用该科最近一条可估分记录（任何日期），数值旁标注日期并在副标题说明。 */
  function sprint7dCutoff(){
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /* 一条记录的 parts 按桶累加（accuracy 桶记 c/tot/n，score 桶记 s/w/n） */
  function bucketAdd(buckets, r, cfg){
    (r.parts || []).forEach(p => {
      if(!p || !p.label) return;
      const b = buckets[p.label] || (buckets[p.label] = { n:0, c:0, tot:0, s:0, w:0 });
      if(typeof p.score === 'number'){
        b.s += p.score; b.w += partWeight(cfg, p.label); b.n += 1;
      } else if(typeof p.correct === 'number' && typeof p.total === 'number' && p.total > 0){
        b.c += p.correct; b.tot += p.total; b.n += 1;
      }
    });
  }
  /* 分桶 → 该科 band。听/读：Σ各 part 平均答对 ÷ 平均题数 → 折 40 查表；
     写作：各 part 平均后再按权重合成（T2 权重 2，练得多的 part 不会稀释另一个）。 */
  function bandFromBuckets(type, cfg, buckets){
    let any = false;
    if(cfg.mode === 'score'){
      let num = 0, den = 0;
      Object.keys(buckets).forEach(k => {
        const b = buckets[k];
        if(b.n > 0 && b.w > 0){
          const w = partWeight(cfg, k);
          num += (b.s / b.n) * w; den += w; any = true;
        }
      });
      return any ? num / den : null;
    }
    let sum = 0, tot = 0;
    Object.keys(buckets).forEach(k => {
      const b = buckets[k];
      if(b.n > 0){ sum += b.c / b.n; tot += b.tot / b.n; any = true; }
    });
    return any ? estimateBand(type, sum, tot) : null;
  }
  /* 单条记录独立估分（供回退：7 天内没数据的科用最近一次） */
  function bandFromRec(type, cfg, r){
    const parts = Array.isArray(r.parts) ? r.parts : [];
    if(cfg.mode === 'score'){
      let num = 0, den = 0;
      parts.forEach(p => {
        if(typeof p.score === 'number'){ const w = partWeight(cfg, p.label); num += p.score * w; den += w; }
      });
      return den > 0 ? num / den : null;
    }
    let c = 0, t = 0;
    parts.forEach(p => { if(typeof p.correct === 'number' && typeof p.total === 'number'){ c += p.correct; t += p.total; } });
    return t > 0 ? estimateBand(type, c, t) : null;
  }
  function recentAvgs(){
    const cutoff = sprint7dCutoff();
    const recs = ((DATA && DATA.mockRecords) || [])
      .filter(r => r && (MOCK_TYPES[r.type] || isSpeakingMockRec(r)))
      .slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const buckets = {}, bands7 = {}, fallback = {};
    SKILLS.forEach(k => { buckets[k] = {}; bands7[k] = []; });
    recs.forEach(r => {
      const isSpMock = isSpeakingMockRec(r);
      const ty = isSpMock ? 'speaking' : r.type;
      const cfg = MOCK_TYPES[ty]; if(!cfg) return;
      const date = String(r.date || '');
      const in7 = !!date && date >= cutoff;
      if(isSpMock){
        const ov = parseFloat(r.overall);
        if(!isNaN(ov)){
          if(in7) bands7.speaking.push(ov);
          if(!fallback.speaking) fallback.speaking = { band: ov, date: date };
        }
        return;
      }
      if(!fallback[ty]){
        const bd = bandFromRec(ty, cfg, r);
        if(bd != null) fallback[ty] = { band: bd, date: date };
      }
      if(in7) bucketAdd(buckets[ty], r, cfg);
    });
    const avg = {}, fromFallback = {};
    SKILLS.forEach(k => {
      if(k === 'speaking'){
        if(bands7.speaking.length) avg[k] = bands7.speaking.reduce((a, b) => a + b, 0) / bands7.speaking.length;
      } else {
        const bd = bandFromBuckets(k, MOCK_TYPES[k], buckets[k]);
        if(bd != null) avg[k] = bd;
      }
      if(avg[k] == null && fallback[k]){ avg[k] = fallback[k].band; fromFallback[k] = fallback[k].date; }
    });
    return { avg: avg, fb: fromFallback };
  }
  function renderGap(d) {
    const tg = ((DATA && DATA.settings) && DATA.settings.targets) || {};
    const hasTarget = SKILLS.some(k => Number(tg[k]) > 0) || Number(tg.overall) > 0;

    const rec = recentAvgs();
    const anyScore = SKILLS.some(k => rec.avg[k] != null);
    if (!anyScore) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">回顾页还没导入过能估分的模考记录（整卷或单项都行）。去'
        + '<a href="review.html">回顾页</a>录入，这里按最近 7 天算你和目标的差距。</p>'
        + '</div>';
    }
    if (!hasTarget) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">还没设目标分，去<a href="settings.html">设置</a>填一下，这里会按科算差距。</p>'
        + '</div>';
    }

    let rows = '';
    let worst = null;
    const fbKeys = [];
    SKILLS.forEach(k => {
      const t = Number(tg[k]) || 0;
      const got = rec.avg[k];
      if (got == null) return;                 // 从没录过这一科（连回退记录都没有）就不比
      const fb = rec.fb[k]; if (fb) fbKeys.push(LABEL[k]);
      if (!t) return;                          // 没设这科的目标也没法比
      const diff = Math.round((got - t) * 10) / 10;
      if (worst === null || diff < worst.diff) worst = { k: k, diff: diff };
      const cls = diff >= 0 ? 'ok' : (diff >= -0.5 ? 'near' : 'bad');
      const dtxt = diff > 0 ? ('超 ' + diff.toFixed(1)) : (diff === 0 ? '持平' : ('差 ' + Math.abs(diff).toFixed(1)));
      rows += '<div class="sp-gap-row">'
        + '<span class="sp-gap-k">' + LABEL[k] + '</span>'
        + '<span class="sp-gap-bar"><i class="' + cls + '" style="width:' + Math.min(100, Math.round(got / 9 * 100)) + '%"></i></span>'
        + '<span class="sp-gap-v">' + got.toFixed(1) + '<em>/' + (t ? t.toFixed(1) : '—') + (fb ? ' · ' + fb.slice(5) : '') + '</em></span>'
        + '<span class="sp-gap-d ' + cls + '">' + dtxt + '</span>'
        + '</div>';
    });
    if (!rows) {
      return '<div class="sp-card">'
        + '<div class="sp-card-h">离目标还差多少</div>'
        + '<p class="sp-empty">只设了总分，单科目标没填或没导入过分项记录，按科比不了。去'
        + '<a href="settings.html">设置</a>把单科目标补上更直观。</p>'
        + '</div>';
    }
    // 剩多少天说多少天，别写死天数
    const tip = (worst && worst.diff < 0)
      ? (d > 1
        ? '<p class="sp-tip">最大缺口是<b>' + LABEL[worst.k] + '</b>（差 ' + Math.abs(worst.diff).toFixed(1) + ' 分）——最后 ' + d + ' 天优先砸它，性价比最高。</p>'
        : '<p class="sp-tip">最大缺口是<b>' + LABEL[worst.k] + '</b>（差 ' + Math.abs(worst.diff).toFixed(1) + ' 分）——没时间补了，考场上先做有把握的题，别恋战。</p>')
      : '<p class="sp-tip">都已达标，保持手感就行，别在最后几天换方法。</p>';
    const sub = '近 7 天模考均分' + (fbKeys.length ? ' · ' + fbKeys.join('、') + ' 按最近一次' : '');
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
