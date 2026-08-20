/* 口语页「学习情况」tab 渲染（Feature B，纯展示层，不动 DATA 结构）。
   由 speaking.html 的 <script defer> 加载（定义 window.renderProgress），
   speaking.js 在切到 PROGRESS tab 时调用 renderProgress() 实时计算并渲染。
   依赖全局：DATA、escapeHtml、FREQ_LABEL（data.js）。 */
(function () {
  // 聚合单个话题下所有单题手写练习记录
  function topicRecords(s) {
    const out = [];
    if (s.type === 'P2') {
      const recs = (s.answers && s.answers.p2 && s.answers.p2.records) || [];
      recs.forEach(r => out.push(r));
    } else {
      const ans = s.answers || {};
      (s.questions || []).forEach((q, qi) => {
        const recs = (ans[qi] && ans[qi].records) || [];
        recs.forEach(r => out.push(r));
      });
    }
    return out;
  }
  function countOf(s) { return topicRecords(s).length; }
  function lastTs(s) { let m = 0; topicRecords(s).forEach(r => { if (r.ts > m) m = r.ts; }); return m; }
  function practiced(s) { return countOf(s) > 0; }

  // 必考题进度环（半径 40 → 周长 ≈ 251.2）
  function ring(done, total) {
    const C = 251.2;
    const pct = total ? done / total : 0;
    const off = C * (1 - pct);
    const col = (done === total && total > 0) ? 'var(--med)' : 'var(--primary)';
    return '<svg width="96" height="96" viewBox="0 0 96 96">'
      + '<circle cx="48" cy="48" r="40" fill="none" stroke="var(--primary-soft)" stroke-width="10"/>'
      + '<circle cx="48" cy="48" r="40" fill="none" stroke="' + col + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 48 48)"/>'
      + '<text x="48" y="44" text-anchor="middle" class="ring-num">' + done + '/' + total + '</text>'
      + '<text x="48" y="62" text-anchor="middle" class="ring-sub">已练</text>'
      + '</svg>';
  }

  window.renderProgress = function () {
    const el = document.getElementById('progressView');
    if (!el) return;

    const list = DATA.speaking || [];
    let total = list.length, doneTopics = 0, totalPass = 0;
    let p1Total = 0, p1Done = 0, p2Total = 0, p2Done = 0;
    list.forEach(s => {
      const c = countOf(s); totalPass += c;
      if (c > 0) doneTopics++;
      if (s.type === 'P2') { p2Total++; if (c > 0) p2Done++; }
      else { p1Total++; if (c > 0) p1Done++; }
    });
    const coverage = total ? Math.round(doneTopics / total * 100) : 0;

    // 必考题专项
    const must = list.filter(s => s.type === 'P1' && s.frequency === 'must');
    const mustDone = must.filter(practiced).length;
    let mustTxt;
    const unMust = must.filter(s => !practiced(s));
    if (unMust.length) {
      mustTxt = '未练：' + unMust.map(s => '<b>' + escapeHtml(s.titleEn || s.titleZh || '') + '（必考）</b>').join('、') + ' —— <a href="speaking.html">去练习 →</a>';
    } else if (must.length) {
      mustTxt = '必考题已全部练过，保持住 💪';
    } else {
      mustTxt = '本季 P1 无必考题档位。';
    }

    // 各档位进度条（只显示数据里实际出现的档位）
    const order = ['must', 'high', 'subhigh', 'mid', 'low'];
    const present = order.filter(f => list.some(s => s.frequency === f));
    let bars = '';
    present.forEach(f => {
      const grp = list.filter(s => s.frequency === f);
      const gd = grp.filter(practiced).length;
      const pct = grp.length ? Math.round(gd / grp.length * 100) : 0;
      bars += '<div class="prog-bar-row"><span class="freq-badge ' + f + '">' + (FREQ_LABEL[f] || f) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="bar-num">' + gd + '/' + grp.length + '</span></div>';
    });

    // 每题练习遍数列表（默认：遍数多→少，同遍数按最近练习时间）
    const rows = list.map(s => ({ s, c: countOf(s), ts: lastTs(s), f: s.frequency, title: s.titleEn || s.titleZh || '未命名' }))
      .sort((a, b) => (b.c - a.c) || (b.ts - a.ts));
    let pl = '';
    rows.forEach(r => {
      const dots = r.c > 0 ? '●'.repeat(Math.min(r.c, 10)) : '·';
      const time = r.ts ? (function () { const d = new Date(r.ts); const p = n => String(n).padStart(2, '0'); return (d.getMonth() + 1) + '-' + p(d.getDate()); })() : '—';
      pl += '<div class="pl-row"><span class="freq-badge ' + (r.f || 'low') + '">' + (FREQ_LABEL[r.f] || r.f || '') + '</span>'
        + '<span class="pl-title">' + escapeHtml(r.title) + (r.s.type === 'P2' ? ' (P2)' : '') + '</span>'
        + '<span class="pl-dots">' + dots + '</span>'
        + '<span class="pl-count">' + r.c + ' 遍</span>'
        + '<span class="pl-time">' + time + '</span></div>';
    });

    el.innerHTML =
      '<div class="prog-grid">'
      + '<div class="prog-card"><div class="n">' + total + '</div><div class="l">话题总数</div></div>'
      + '<div class="prog-card"><div class="n">' + doneTopics + '</div><div class="l">已练话题</div></div>'
      + '<div class="prog-card"><div class="n">' + coverage + '%</div><div class="l">覆盖率</div></div>'
      + '<div class="prog-card"><div class="n">' + totalPass + '</div><div class="l">总练习遍数</div></div>'
      + '</div>'

      + '<section class="card"><h2>必考题进度</h2><div class="prog-ring"><div class="ring-wrap">' + ring(mustDone, must.length) + '</div><div class="prog-ring-txt">必考题共 <b>' + must.length + '</b> 道，已练 <b>' + mustDone + '</b> 道。<br>' + mustTxt + '</div></div></section>'

      + '<section class="card"><h2>各档位进度</h2>' + bars + '</section>'

      + '<section class="card"><h2>Part 分块</h2><div class="prog-part"><span>P1 已练 <b>' + p1Done + '</b>/' + p1Total + '</span><span>P2 已练 <b>' + p2Done + '</b>/' + p2Total + '</span><span>P1 练习 <b>' + list.filter(s => s.type !== 'P2').reduce((a, s) => a + countOf(s), 0) + '</b> 遍</span><span>P2 练习 <b>' + list.filter(s => s.type === 'P2').reduce((a, s) => a + countOf(s), 0) + '</b> 遍</span></div></section>'

      + '<section class="card"><h2>每题练习遍数（P1 / P2）</h2><div class="pract-list">' + pl + '</div></section>';
  };
})();
