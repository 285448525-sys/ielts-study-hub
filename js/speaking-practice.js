/* 回顾页「口语日常练习」section 渲染（Feature A，纯展示层，不动 DATA 结构）。
   由 review.html 的 <script defer> 与 review.js 的软导航加载链共同保证：
   - 直接打开回顾页（全量加载）→ 本文件 defer 执行，注册 ready 后渲染；
   - 软导航回到回顾页 → review.js eval 本文件，立即重新渲染（幂等）。
   依赖全局：DATA（data.js）、escapeHtml / FREQ_LABEL（data.js）。
   不依赖 speaking.js（口语页脚本，回顾页未加载），故纠错渲染全部自包含。 */
(function () {
  // 聚合单个话题下所有单题手写练习记录（P1 各小题 / P2 整体）
  function topicRecords(s) {
    const out = [];
    if (s.type === 'P2') {
      const recs = (s.answers && s.answers.p2 && s.answers.p2.records) || [];
      recs.forEach(r => out.push({ part: 'P2', title: s.titleEn || s.titleZh || '', q: s.promptEn || s.promptZh || '', ...r }));
    } else {
      const ans = s.answers || {};
      (s.questions || []).forEach((q, qi) => {
        const recs = (ans[qi] && ans[qi].records) || [];
        recs.forEach(r => out.push({ part: 'P1', title: s.titleEn || s.titleZh || '', q: q || '', ...r }));
      });
    }
    return out;
  }

  // 评分徽标配色：≥6 绿 / 5–5.5 琥珀 / <5 红（严格用 Token）
  function scoreBadge(v) {
    if (v == null) return '';
    const cls = v >= 6 ? 'good' : (v >= 5 ? 'ok' : 'low');
    const txt = (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1);
    return '<span class="score-badge ' + cls + '">' + txt + '</span>';
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 复用全站评分头部样式（.sp-score-header 由 common.css 提供）
  function scoreHeader(score) {
    if (!score || score.overall == null) return '';
    const label = v => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1));
    const dims = [['fluency', '流利度'], ['vocabulary', '词汇'], ['grammar', '语法']];
    if (score.pronunciation != null) dims.push(['pronunciation', '发音']);
    let h = '<div class="sp-score-header"><div class="sp-score-total"><span class="sp-score-num">' + label(score.overall) + '</span><span class="sp-score-label">得分</span></div><div class="sp-score-dims">';
    dims.forEach(d => { h += '<div class="sp-score-dim"><span class="sp-score-dim-val">' + label(score[d[0]]) + '</span><span class="sp-score-dim-lab">' + d[1] + '</span></div>'; });
    h += '</div></div>';
    return h;
  }

  // 解析记录里的 AI 诊断 JSON（r.result），渲染纠错（wrong→correct→note）+ 建议
  function renderDiagBody(r) {
    let j = null;
    if (r.result) { try { j = JSON.parse(r.result); } catch (_) { j = null; } }
    let h = '';
    if (r.score) h += scoreHeader(r.score);
    if (j && Array.isArray(j.errors)) {
      const errs = j.errors.filter(e => e && (e.original || e.issue || e.fix)).slice(0, 12);
      if (errs.length) {
        h += '<div class="diag-sec" style="margin-top:8px"><b>① 语法/用词纠错</b>';
        errs.forEach(e => {
          const orig = escapeHtml(e.original || '');
          const fix = escapeHtml(e.fix || '');
          const note = escapeHtml((e.issue && e.issue !== e.original) ? e.issue : '');
          let line = '<div class="diag-err">';
          if (orig) line += '<span class="diag-orig">' + orig + '</span> → ';
          if (fix) line += '<span class="diag-fix">' + fix + '</span>';
          if (note) line += ' <span class="muted">（' + note + '）</span>';
          line += '</div>';
          h += line;
        });
        h += '</div>';
      }
    }
    if (j && j.rewrite) h += '<div class="diag-sec" style="margin-top:8px"><b>② 改进建议</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
    if (j && j.suggestions) h += '<div class="diag-sec" style="margin-top:8px"><b>③ 建议</b><div class="diag-note">' + escapeHtml(j.suggestions) + '</div></div>';
    if (!h) h = '<div class="diag-note" style="margin-top:8px">（本次记录无结构化纠错数据）</div>';
    return h;
  }

  window.renderSpeakingPractice = function () {
    const list = document.getElementById('spPracticeList');
    const countEl = document.getElementById('spPracticeCount');
    if (!list) return;

    const all = [];
    let p1Total = 0, p1Done = 0, p2Total = 0, p2Done = 0;
    (DATA.speaking || []).forEach(s => {
      const recs = topicRecords(s);
      if (s.type === 'P2') { p2Total++; if (recs.length) p2Done++; }
      else { p1Total++; if (recs.length) p1Done++; }
      recs.forEach(r => all.push(r));
    });
    all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (countEl) countEl.textContent = '· 共 ' + all.length + ' 遍';

    if (!all.length) {
      list.innerHTML = '<div class="practice-empty">还没有口语单题练习记录。去 <a href="speaking.html" style="color:var(--primary);font-weight:700">口语页</a> 练几题吧～</div>';
      return;
    }

    let html = '<div class="practice-summary">'
      + '<span>P1 已练 <b>' + p1Done + '</b>/' + p1Total + '</span>'
      + '<span>P2 已练 <b>' + p2Done + '</b>/' + p2Total + '</span>'
      + '<span>共 <b>' + all.length + '</b> 遍</span></div>';
    html += '<div class="practice-list">';
    all.forEach((r, i) => {
      const ans = escapeHtml((r.text || '').trim()) || '<span class="muted">（未保存回答文本）</span>';
      const sc = (r.score && r.score.overall != null) ? r.score.overall : null;
      html += '<div class="practice-item" data-pi="' + i + '">'
        + '<div class="pi-head">'
        + '<span class="part-badge">' + r.part + '</span>'
        + '<span class="pi-title">' + escapeHtml(r.title || '未命名话题') + '</span>'
        + '<span class="pi-q">' + escapeHtml(r.q || '') + '</span>'
        + '<span class="pi-time">' + fmtTime(r.ts) + '</span>'
        + (sc != null ? scoreBadge(sc) : '')
        + '</div>'
        + '<div class="pi-body">'
        + '<div class="pi-ans">' + ans + '</div>'
        + renderDiagBody(r)
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    list.innerHTML = html;

    list.querySelectorAll('.practice-item').forEach(el => {
      el.addEventListener('click', () => { el.classList.toggle('open'); });
    });
  };

  // 全量加载（直接打开回顾页）时自动渲染；软导航由 review.js 再次调用（幂等）。
  ready(() => { if (typeof window.renderSpeakingPractice === 'function') window.renderSpeakingPractice(); });
})();
