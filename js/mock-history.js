/* 口语模考 · 历史记录渲染（可复用）
   从 DATA.mockRecords 中挑出口语整卷模考记录（kind==='speaking'，或旧记录无 parts 但有 p1），
   渲染成「可展开的报告卡」：总分 Band + 六维 + AI 总评 + 逐题转写（P1/P2/P3）+ 删除。
   同时被 mock.html（常驻历史区）与 review.html（🎤 口语模考 tab）调用。
   注意：本文件只读取 DATA.mockRecords 与渲染，不修改业务数据；删除走 confirm + hubSave。 */
(function(){
  const EH = (typeof escapeHtml === 'function')
    ? escapeHtml
    : (s => String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

  function isSpeakingRec(r){
    return r && (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1));
  }

  function reportBlock(rec){
    // 新记录（2026-08-19 起，分 P1/P2/P3 四维 + 逐题纠错）：完整渲染「问题 / 回答 / 哪里错 / 改什么」
    if(rec.parts){
      return (window.MockReport)
        ? window.MockReport.render({
            overall: rec.overall,
            pronMode: rec.pronMode,
            pronunciationScore: rec.pronunciationScore,
            parts: rec.parts,
            summary: rec.summary,
            p1: rec.p1, p2: rec.p2, p3: rec.p3
          })
        : '';
    }
    // 旧记录（整卷五维）：复用 MockReport.render 渲染总分 + 六维 + 总评（发音维度已标注「自设」）
    const rpt = (window.MockReport) ? window.MockReport.render({ dims: rec.dims, overall: rec.overall, summary: rec.summary }) : '';
    const qa = arr => (arr || []).map(x =>
      '<li><b>Q：</b>' + EH(x.q) + '<br><b>A：</b>' + EH(x.transcript || '(空)') + '</li>').join('');
    const p2 = rec.p2
      ? '<li><b>P2 题目（英文）：</b>' + EH(rec.p2.promptEn || '') + '<br><b>你的陈述：</b>' + EH(rec.p2.transcript || '(空)') + '</li>'
      : '';
    const hasTrans = (rec.p1 && rec.p1.length) || rec.p2 || (rec.p3 && rec.p3.length);
    const trans = hasTrans
      ? '<div class="mock-hist-trans"><div class="mock-hist-trans-title">逐题转写</div>'
        + (rec.p1 && rec.p1.length ? '<div class="mock-hist-sec">Part 1</div><ul class="mock-hist-qa">' + qa(rec.p1) + '</ul>' : '')
        + (rec.p2 ? '<div class="mock-hist-sec">Part 2</div><ul class="mock-hist-qa">' + p2 + '</ul>' : '')
        + (rec.p3 && rec.p3.length ? '<div class="mock-hist-sec">Part 3</div><ul class="mock-hist-qa">' + qa(rec.p3) + '</ul>' : '')
        + '</div>'
      : '';
    return rpt + trans;
  }

  function render(listEl, opts){
    opts = opts || {};
    if(!listEl) return;
    const all = (typeof DATA !== 'undefined' && DATA.mockRecords) ? DATA.mockRecords : [];
    const recs = all.filter(isSpeakingRec)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0) || String(b.date || '').localeCompare(String(a.date || '')));

    if(opts.countEl) opts.countEl.textContent = recs.length ? ('（' + recs.length + ' 次）') : '';

    if(!recs.length){
      listEl.innerHTML = '<p class="muted">还没有口语模考记录。完成一次模考后，记录会出现在这里，刷新也不会丢。</p>';
      return;
    }

    listEl.innerHTML = recs.map(r => {
      const overall = (r.overall != null) ? r.overall : '—';
      return '<div class="mock-hist-card" data-id="' + r.id + '">'
        + '<div class="mock-hist-head">'
        +   '<div class="mock-hist-meta"><b>' + EH(r.date || '') + '</b>'
        +     ' <span class="badge overall">总 Band ' + EH(String(overall)) + '</span>'
        +     (r.pronunciationScore != null ? ' <span class="badge">发音 ' + r.pronunciationScore + '</span>' : '')
        +   '</div>'
        +   '<div class="mock-hist-ops">'
        +     '<button class="btn sm mock-hist-toggle" data-id="' + r.id + '">展开 ▾</button>'
        +     '<button class="btn sm danger mock-hist-del" data-id="' + r.id + '">删除</button>'
        +   '</div>'
        + '</div>'
        + '<div class="mock-hist-body" id="mh-' + r.id + '" hidden>' + reportBlock(r) + '</div>'
        + '</div>';
    }).join('');

    listEl.querySelectorAll('.mock-hist-toggle').forEach(b => b.addEventListener('click', () => {
      const body = document.getElementById('mh-' + b.dataset.id);
      if(!body) return;
      const hide = body.hidden;
      body.hidden = !hide;
      b.textContent = hide ? '收起 ▴' : '展开 ▾';
    }));

    listEl.querySelectorAll('.mock-hist-del').forEach(b => b.addEventListener('click', () => {
      const rec = all.find(x => x.id === b.dataset.id);
      if(!rec) return;
      if(!confirm('删除 ' + (rec.date || '') + ' 的这次口语模考记录？此操作不可恢复。')) return;
      DATA.mockRecords = all.filter(x => x.id !== b.dataset.id);
      DATA.deletedIds = DATA.deletedIds || [];
      if(b.dataset.id != null && !DATA.deletedIds.includes(b.dataset.id)) DATA.deletedIds.push(b.dataset.id);
      hubSave();
      render(listEl, opts);
      if(typeof toast === 'function') toast('已删除该模考记录');
    }));
  }

  window.MockHistory = { render, isSpeakingRec };

  // 自动渲染：页面含 #mockHistoryList 时（mock.html 常驻区 / review.html 口语模考 tab），
  // 在 DOM 就绪后渲染一次。软导航下由 review.js 重新 eval 本文件再次触发。
  if(typeof ready === 'function'){
    ready(() => {
      const list = document.getElementById('mockHistoryList');
      if(list) render(list, { countEl: document.getElementById('mockHistCount') });
    });
  }
})();
