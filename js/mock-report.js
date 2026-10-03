/* 口语模考 · 报告渲染：把评分结果渲染成 Band 报告卡。
   两种结构：
   - 新（2026-08-19 起）：report.parts = { p1/p2/p3: { fc, lr, gra, overall, fixes[], summary } }，
     按口语官方四维（FC 流利与连贯 / LR 词汇 / GRA 语法 / 发音=设置固定分）分别给 P1/P2/P3 评分，
     并带逐题「错误 → 改正 → 原因」明细。overall = 三部分 overall 平均。
   - 旧（兼容历史记录）：report.dims = { fluency, taskResponse, coherence, lexical, grammar } 整卷五维。
   发音维度：直接取用户在设置里填的固定分（发音评测已移除，不做声学打分）。 */
(function(){
  function bandColor(v){
    v = Number(v);
    if(isNaN(v)) return 'var(--muted)';
    if(v >= 7) return '#2e9e5b';
    if(v >= 6) return '#3a9a93';
    if(v >= 5) return '#e0a32e';
    return '#d9534f';
  }
  function fmt(v){
    v = Number(v);
    if(isNaN(v)) return '—';
    return String(Math.round(v * 10) / 10);
  }
  function dimBar(html, x){
    const pct = Math.max(0, Math.min(100, (Number(x.val) || 0) / 9 * 100));
    html += '<div class="mock-dim">'
      + '<div class="mock-dim-top"><span>' + x.label + '</span>'
      + '<b style="color:' + bandColor(x.val) + '">' + fmt(x.val) + '</b></div>'
      + '<div class="mock-dim-track"><div class="mock-dim-fill" style="width:' + pct + '%;background:' + bandColor(x.val) + '"></div></div>'
      + (x.note ? '<div class="mock-dim-note">' + x.note + '</div>' : '')
      + '</div>';
    return html;
  }

  /* ---------- 新结构：分部分四维 + 逐题纠错 ---------- */
  function renderPart(partKey, label, p, pron){
    if(!p) return '';
    const dims = [
      { label:'FC 流利与连贯', val:p.fc },
      { label:'LR 词汇', val:p.lr },
      { label:'GRA 语法', val:p.gra },
    ];
    if(pron != null) dims.push({ label:'发音', val:pron, note:'你在设置里填的固定分' });
    let html = '<div class="mock-part-card' + (p.unanswered ? ' is-unanswered' : '') + '">';
    html += '<div class="mock-part-head"><span class="mock-part-name">' + label + '</span>'
      + (p.unanswered
          ? '<span class="mock-part-flag">未作答 · 不计入总分</span>'
          : (p.overall != null ? '<span class="mock-part-band" style="color:' + bandColor(p.overall) + '">' + fmt(p.overall) + '</span>' : ''))
      + '</div>';
    /* 10/4 00:40：作答情况 + FC 扣分来源必须写在报告里，
       否则「4 分」看起来像她答得很差，实际是整 part 没答。 */
    if(p.unanswered){
      html += '<div class="mock-part-note">这一部分 ' + (p.questionCount || 0) + ' 题<b>全部未作答</b>，'
        + '按雅思有效最低档 4 分记，仅供参考、<b>不参与总 Band 平均</b>。真实考试里跳过整部分会大幅影响总分。</div>';
    }else if(p.questionCount != null){
      const skip = p.questionCount - (p.answeredCount || 0);
      html += '<div class="mock-part-note">作答 <b>' + p.answeredCount + '/' + p.questionCount + '</b> 题'
        + (skip > 0
            ? '，有 <b>' + skip + ' 题未作答</b>。流利度已按作答比例下调'
              + (p.fcPenalty ? '（' + (p.fc + p.fcPenalty) + ' → <b>' + p.fc + '</b>）' : '') + '。'
            : '，全部作答。')
        + '</div>';
    }
    html += '<div class="mock-dims">';
    dims.forEach(x => { html = dimBar(html, x); });
    html += '</div>';
    const fixes = (p.fixes || []).filter(f => f.q && f.errors && f.errors.length);
    if(fixes.length){
      html += '<div class="mock-fix-block"><div class="mock-fix-title">✎ 逐题纠错（错误 → 改正 → 原因）</div>';
      fixes.forEach(f => {
        html += '<div class="mock-fix-q">Q：' + escapeHtml(f.q) + '</div><ul class="mock-fix-list">';
        (f.errors || []).forEach(e => {
          html += '<li><span class="mock-fix-wrong">' + escapeHtml(e.wrong || '') + '</span>'
            + ' → <span class="mock-fix-correct">' + escapeHtml(e.correct || '') + '</span>'
            + (e.note ? ' <span class="mock-fix-note">（' + escapeHtml(e.note) + '）</span>' : '')
            + '</li>';
        });
        html += '</ul>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderNew(report){
    const parts = report.parts || {};
    const pron = (report.pronunciationScore != null) ? report.pronunciationScore : null;
    let html = '';
    /* 10/4 00:40（她 00:38 拍板）：总分必须标清「基于答了哪些部分 / 作答率多少」。
       她截图那次 P1 全跳过却显示 5.5，观感就是缺这一层交代。 */
    const naParts = (report.unansweredParts || []).length;
    const ovLabel = '总 Band（'
      + (naParts ? '仅含已作答的 Part' : 'P1 / P2 / P3 平均')
      + (report.answeredCount != null && report.questionCount ? ' · 作答 ' + report.answeredCount + '/' + report.questionCount + ' 题' : '')
      + '）';
    // 总分
    html += '<div class="mock-overall">';
    html += '<div class="mock-overall-score" style="color:' + bandColor(report.overall) + '">' + fmt(report.overall) + '</div>';
    html += '<div class="mock-overall-label">' + escapeHtml(ovLabel) + '</div>';
    if(report.lowConfidence){
      html += '<div class="mock-ov-warn">这份报告的作答率偏低（' + (report.answerRate != null ? report.answerRate : '?') + '%），'
        + '未作答的题在真实考试里会影响流利度分，<b>这个总 Band 只能代表你答过的那部分水平</b>。</div>';
    }
    html += '</div>';
    // 分部分四维
    html += renderPart('p1', 'Part 1', parts.p1, pron);
    html += renderPart('p2', 'Part 2', parts.p2, pron);
    html += renderPart('p3', 'Part 3', parts.p3, pron);
    // 完整记录（问题 / 我的回答）
    const qa = arr => (arr || []).map(x =>
      '<li><b>Q：</b>' + escapeHtml(x.q) + (x.opening ? ' <span class="mock-fix-note">（开场问，不计分）</span>' : '')
      + '<br><b>A：</b>' + escapeHtml(x.transcript || '(空)') + '</li>').join('');
    const p2 = report.p2
      ? '<li><b>P2 题目（英文）：</b>' + escapeHtml(report.p2.promptEn || '') + '<br><b>你的陈述：</b>' + escapeHtml(report.p2.transcript || '(空)') + '</li>'
      : '';
    const hasTrans = (report.p1 && report.p1.length) || report.p2 || (report.p3 && report.p3.length);
    if(hasTrans){
      html += '<div class="mock-hist-trans"><div class="mock-hist-trans-title">完整记录（问题 / 我的回答）</div>'
        + (report.p1 && report.p1.length ? '<div class="mock-hist-sec">Part 1</div><ul class="mock-hist-qa">' + qa(report.p1) + '</ul>' : '')
        + (report.p2 ? '<div class="mock-hist-sec">Part 2</div><ul class="mock-hist-qa">' + p2 + '</ul>' : '')
        + (report.p3 && report.p3.length ? '<div class="mock-hist-sec">Part 3</div><ul class="mock-hist-qa">' + qa(report.p3) + '</ul>' : '')
        + '</div>';
    }
    // 诚实声明
    const pronClaim = (report.pronMode === 'fixed' && pron != null)
      ? '<b>设置里的固定分 ' + pron + '</b>（发音不评测，直接采用你填的数字）'
      : '你尚未在设置里填固定发音分（发音不计入总分）';
    html += '<p class="mock-report-note">⚠️ 发音：' + pronClaim + '；FC / LR / GRA 由 AI 读你的<b>文字转写</b>评出，不代表 AI 真「听懂」了意思。若转写明显错误，评分仅供参考。</p>';
    // 文字总评
    if(report.summary){
      html += '<div class="mock-summary"><div class="mock-summary-title">AI 逐部分总评</div>' + escapeHtml(report.summary).replace(/\n/g, '<br>') + '</div>';
    }
    return html;
  }

  /* ---------- 旧结构（兼容历史记录：整卷五维） ---------- */
  function renderLegacy(report){
    const d = report.dims || {};
    const overall = report.overall;
    const mode = report.pronMode;
    const dims = [
      { label:'流利度',   val:d.fluency },
      { label:'扣题',     val:d.taskResponse },
      { label:'连贯',     val:d.coherence },
      { label:'词汇',     val:d.lexical },
      { label:'语法',     val:d.grammar },
    ];
    if(d.pronunciation != null) dims.push({ label:'发音', val:d.pronunciation, note:'你在设置里填的固定分' });
    let html = '';
    html += '<div class="mock-overall">';
    html += '<div class="mock-overall-score" style="color:' + bandColor(overall) + '">' + fmt(overall) + '</div>';
    html += '<div class="mock-overall-label">总 Band（雅思四维度平均）</div>';
    html += '</div>';
    html += '<div class="mock-dims">';
    dims.forEach(x => { html = dimBar(html, x); });
    html += '</div>';
    const pronClaim = (mode === 'fixed')
      ? '<b>设置里的固定分</b>（发音不评测，直接采用你填的数字）'
      : '你尚未在设置里填固定发音分（发音不计入总分）';
    html += '<p class="mock-report-note">⚠️ 发音：' + pronClaim + '；流利度 / 扣题 / 连贯 / 词汇 / 语法由 AI 读你的<b>文字转写</b>评出，不代表 AI 真「听懂」了意思。若转写明显错误，评分仅供参考。</p>';
    if(report.summary){
      html += '<div class="mock-summary"><div class="mock-summary-title">AI 文字总评</div>' + escapeHtml(report.summary) + '</div>';
    }
    return html;
  }

  function render(report){
    if(!report) return '<p class="muted">暂无报告。</p>';
    if(report.parts) return renderNew(report);
    return renderLegacy(report);
  }
  window.MockReport = { render };
})();
