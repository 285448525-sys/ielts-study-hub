/* 口语模考 · 报告渲染：把评分结果渲染成 Band 报告卡。
   诚实边界（与执行方案 §6 一致）：
   - 发音 = 用户自设固定分（DATA.settings.pronunciationScore 快照），不是 AI 算的、也不是真听出来的。
   - 流利度/扣题/连贯/词汇/语法 = AI 读转写文字评出。
   - overall = 雅思四官方维度四等分平均：发音 / 流利度 / 词汇语法(词+法平均) / 连贯。 */
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
  function render(report){
    if(!report) return '<p class="muted">暂无报告。</p>';
    const d = report.dims || {};
    const overall = report.overall;
    const dims = [
      { label:'发音',     val:d.pronunciation, fixed:true,  note:'你自设的固定分（设置里填写）' },
      { label:'流利度',   val:d.fluency },
      { label:'扣题',     val:d.taskResponse },
      { label:'连贯',     val:d.coherence },
      { label:'词汇',     val:d.lexical },
      { label:'语法',     val:d.grammar },
    ];
    let html = '';
    // 总分
    html += '<div class="mock-overall">';
    html += '<div class="mock-overall-score" style="color:' + bandColor(overall) + '">' + fmt(overall) + '</div>';
    html += '<div class="mock-overall-label">总 Band（雅思四维度平均）</div>';
    html += '</div>';
    // 六维
    html += '<div class="mock-dims">';
    dims.forEach(x => {
      const pct = Math.max(0, Math.min(100, (Number(x.val) || 0) / 9 * 100));
      html += '<div class="mock-dim">'
        + '<div class="mock-dim-top"><span>' + x.label + (x.fixed ? ' <span class="mock-fixed-tag">自设</span>' : '') + '</span>'
        + '<b style="color:' + bandColor(x.val) + '">' + fmt(x.val) + '</b></div>'
        + '<div class="mock-dim-track"><div class="mock-dim-fill" style="width:' + pct + '%;background:' + bandColor(x.val) + '"></div></div>'
        + (x.note ? '<div class="mock-dim-note">' + x.note + '</div>' : '')
        + '</div>';
    });
    html += '</div>';
    // 诚实声明
    html += '<p class="mock-report-note">⚠️ 发音分为你<b>自设的固定分</b>；流利度 / 扣题 / 连贯 / 词汇 / 语法由 AI 读你的<b>文字转写</b>评出，不代表 AI 真「听懂」了意思或测了你的发音。若转写明显错误，评分仅供参考。</p>';
    // 文字总评
    if(report.summary){
      html += '<div class="mock-summary"><div class="mock-summary-title">AI 文字总评</div>' + escapeHtml(report.summary) + '</div>';
    }
    return html;
  }
  window.MockReport = { render };
})();
