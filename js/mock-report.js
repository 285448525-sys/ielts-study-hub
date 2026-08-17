/* 口语模考 · 报告渲染：把评分结果渲染成 Band 报告卡。
   诚实边界（与执行方案 §6 一致）：
   - 发音来源三选一，报告里诚实标注用了哪种：
       ise      = 讯飞语音评测真实声学打分（每 Part 后朗读检测准确度均值）
       fixed    = 用户在设置里填的固定分（兜底，未配讯飞 Key 时）
       estimate = DeepSeek 基于文字转写估算（非真实声学，仅供参考）
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
    const mode = report.pronMode;
    const pronNote = mode === 'ise' ? '讯飞语音评测真实打分（各 Part 朗读检测准确度均值）'
      : mode === 'estimate' ? 'DeepSeek 基于文字转写估算（非真实声学）'
      : mode === 'fixed' ? '你在设置里填的固定分（兜底）'
      : '自设固定分';
    const dims = [
      { label:'发音',     val:d.pronunciation, note:pronNote },
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
        + '<div class="mock-dim-top"><span>' + x.label + '</span>'
        + '<b style="color:' + bandColor(x.val) + '">' + fmt(x.val) + '</b></div>'
        + '<div class="mock-dim-track"><div class="mock-dim-fill" style="width:' + pct + '%;background:' + bandColor(x.val) + '"></div></div>'
        + (x.note ? '<div class="mock-dim-note">' + x.note + '</div>' : '')
        + '</div>';
    });
    html += '</div>';
    // 逐 Part 朗读发音检测详情（仅真实评测模式有）
    if(report.pronDetail && report.pronDetail.length){
      html += '<div class="mock-pron-detail">';
      html += '<div class="mock-pron-detail-title">🔊 逐 Part 朗读发音检测（讯飞真实评测）</div>';
      report.pronDetail.forEach(p => {
        html += '<div class="mock-pron-detail-part">';
        html += '<div class="mock-pron-detail-head"><b>' + escapeHtml(p.part || '') + '</b>'
          + ' · 准确度 <b style="color:' + bandColor(p.accuracy) + '">' + fmt(p.accuracy) + '</b>'
          + ' / 流畅度 <b style="color:' + bandColor(p.fluency) + '">' + fmt(p.fluency) + '</b>'
          + ' / 完整度 <b style="color:' + bandColor(p.integrity) + '">' + fmt(p.integrity) + '</b></div>';
        if(p.rejected || p.exceptInfo){
          const reason = (p.rejected ? '未正常朗读' : '') + (p.exceptInfo ? (p.rejected ? '；' : '') + '环境异常 ' + escapeHtml(p.exceptInfo) : '');
          html += '<div class="mock-pron-detail-warn">⚠️ ' + reason + '，本段分数不可信</div>';
        }
        if(p.words && p.words.length){
          html += '<div class="mock-pron-words">';
          p.words.forEach(w => {
            let cls = 'good', tag = '';
            if(w.dp === 16){ cls = 'bad'; tag = '漏读'; }
            else if(w.dp === 32){ cls = 'bad'; tag = '增读'; }
            else if(w.score < 60){ cls = 'bad'; tag = '不准'; }
            else if(w.score < 80){ cls = 'ok'; }
            html += '<span class="mock-pron-word ' + cls + '">' + escapeHtml(w.content || '') + (tag ? '<span class="dp">' + tag + '</span>' : '') + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    // 诚实声明
    const pronClaim = mode === 'ise' ? '<b>讯飞真实声学评测</b>（各 Part 朗读检测）'
      : mode === 'estimate' ? '<b>DeepSeek 文字估算</b>（非真实声学，仅供参考）'
      : '<b>设置里的固定分</b>';
    html += '<p class="mock-report-note">⚠️ 发音：' + pronClaim + '；流利度 / 扣题 / 连贯 / 词汇 / 语法由 AI 读你的<b>文字转写</b>评出，不代表 AI 真「听懂」了意思。若转写明显错误，评分仅供参考。</p>';
    // 文字总评
    if(report.summary){
      html += '<div class="mock-summary"><div class="mock-summary-title">AI 文字总评</div>' + escapeHtml(report.summary) + '</div>';
    }
    return html;
  }
  window.MockReport = { render };
})();
