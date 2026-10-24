/* R-4 后半（10-24）：三类成绩合一列 —— 只读渲染，不碰数据层。
   施工书 §三 第四批：「整卷 / 分项 / 口语模考三种记录合成一列按日期排，每条前加小标签」，
   「⚠️ 三种记录各自的删除与编辑仍走现有函数，别为合并去动数据层的删除逻辑」。

   数据源（全部只读，不改一个字段）：
     · 整卷    = DATA.scores        （render() / deleteScore() 在 scores.js）
     · 分项    = DATA.mockRecords   （renderMockList() 在 scores.js）
     · 口语模考 = DATA.mockRecords   （MockHistory.render() 在 mock-history.js）

   🔴 本文件只做「展示层」：
     · 读三个源 → 归一成同一种行 → 按日期排 → 渲染进 #recAll
     · 每条行的「详情 / 删除」按钮**转发到原函数**（点删除走的是 deleteScore /
       MockHistory 自己的删除流程，本文件不另写一套删除）
     · 不改 DATA 的任何字段、不调 hubSave

   ⚠️ 三个原列表（#scoreList / #mkList / #mockHistoryList）一个都没删 —— 它们仍是
      各自模块的渲染目标，探针与软导航重跑都依赖它们。桌面默认折叠成「只看某一类」。 */
(function () {
  const KINDS = {
    whole:    { label: '整卷',     cls: 'rk-whole' },
    part:     { label: '分项',     cls: 'rk-part' },
    speaking: { label: '口语模考', cls: 'rk-speaking' }
  };
  const ACTIVE = { whole: true, part: true, speaking: true };
  let inited = false;

  const esc = s => (typeof escapeHtml === 'function')
    ? escapeHtml(s)
    : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* 整卷：四科 + 总分 */
  function overall(l, r, w, s) {
    return (Number(l) + Number(r) + Number(w) + Number(s)) / 4;
  }

  /* ---- 读三个源，归一成行 ---- */
  function collect() {
    const out = [];
    const scores = (typeof DATA !== 'undefined' && Array.isArray(DATA.scores)) ? DATA.scores : [];
    scores.forEach(x => {
      const lo = overall(x.listening, x.reading, x.writing, x.speaking);
      out.push({
        kind: 'whole',
        date: String(x.date || ''),
        title: '听 ' + x.listening + ' · 读 ' + x.reading + ' · 写 ' + x.writing + ' · 说 ' + x.speaking,
        main: lo.toFixed(1),
        mainLabel: '总分',
        id: x.id,
        hasDetail: false
      });
    });

    const recs = (typeof DATA !== 'undefined' && Array.isArray(DATA.mockRecords)) ? DATA.mockRecords : [];
    recs.forEach(r => {
      /* 分项：有 parts 且不是口语整卷模考 */
      if (Array.isArray(r.parts) && !(r.kind === 'speaking')) {
        const cfg = (typeof MOCK_TYPES !== 'undefined' && MOCK_TYPES[r.type]) || null;
        const hasScore = r.parts.some(p => typeof p.score === 'number');
        let main, mainLabel;
        if (hasScore) {
          const sum = r.parts.reduce((s, p) => s + (p.score || 0), 0);
          const n = r.parts.length || 1;
          main = (sum / n).toFixed(1);
          mainLabel = '均分';
        } else {
          const tc = r.parts.reduce((s, p) => s + (p.correct || 0), 0);
          const tt = r.parts.reduce((s, p) => s + (p.total || 0), 0);
          main = tt ? String(Math.round(tc / tt * 100) + '%') : '—';
          mainLabel = '正确率';
        }
        out.push({
          kind: 'part',
          date: String(r.date || ''),
          title: (cfg ? cfg.name : (r.type || '')) + ' · ' + (r.granularity === 'whole' ? '整卷' : '单项')
            + (r.note ? ' · ' + r.note : ''),
          main: main,
          mainLabel: mainLabel,
          id: r.id,
          hasDetail: Array.isArray(r.detail) && r.detail.length > 0
        });
        return;
      }
      /* 口语整卷模考：kind==='speaking' 或旧记录（无 parts 但有 p1） */
      if (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1)) {
        out.push({
          kind: 'speaking',
          date: String(r.date || ''),
          title: 'P1 / P2 / P3 完整一场',
          main: (r.overall != null) ? String(r.overall) : '—',
          mainLabel: '总分',
          id: r.id,
          hasDetail: true
        });
      }
    });

    /* 按日期排（同日的按 id 倒序，保证稳定） */
    out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || String(b.id || '').localeCompare(String(a.id || '')));
    return out;
  }

  /* ---- 渲染 ---- */
  function render() {
    const box = document.getElementById('recAll');
    if (!box) return;
    const all = collect();
    const list = all.filter(x => ACTIVE[x.kind]);
    const cnt = document.getElementById('recAllCount');
    if (cnt) cnt.textContent = list.length ? ('共 ' + list.length + ' 条') : '';

    if (!all.length) {
      box.innerHTML = '<p class="muted" style="font-size:13.5px;margin:0">还没有任何记录。整卷、分项、口语模考都会汇总到这里，按日期排。</p>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<p class="muted" style="font-size:13.5px;margin:0">当前筛选下没有记录，点上面的标签把它勾回来。</p>';
      return;
    }

    box.innerHTML = list.map(x => {
      const k = KINDS[x.kind] || KINDS.whole;
      return '<div class="rec-row rk-' + x.kind + '" data-id="' + esc(x.id) + '" data-kind="' + x.kind + '">'
        + '<span class="rec-d">' + esc(x.date) + '</span>'
        + '<span class="rec-k ' + k.cls + '">' + k.label + '</span>'
        + '<span class="rec-t">' + esc(x.title) + '</span>'
        + '<span class="rec-s"><b>' + esc(x.main) + '</b><i>' + x.mainLabel + '</i></span>'
        + '<span class="rec-o"><button type="button" class="btn sm rec-det" data-id="' + esc(x.id) + '">详情</button>'
        + '<button type="button" class="btn sm danger rec-del" data-id="' + esc(x.id) + '">删除</button></span>'
        + '</div>';
    }).join('');

    /* 🔴 删除转发：**触发原来那个按钮的点击**，让 scores.js / mock-history.js 里
       现成的删除逻辑原样跑（含 confirm、墓碑、hubSave、重渲染）。
       本文件不另写一套删除 —— 施工书红线「别为合并去动数据层的删除逻辑」。
       做法 = 按 kind 在原列表里找到对应按钮再 .click()：
         · whole    → #scoreList  button[data-del="<id>"]        （deleteScore）
         · part     → #mkList     button[data-del="<id>"]        （renderMockList 里的删除）
         · speaking → #mockHistoryList .mock-hist-del[data-id]   （MockHistory 里的删除）
       找不到就静默返回（比如那条记录在原列表的筛选范围外）。 */
    box.querySelectorAll('.rec-del').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.rec-row');
      if (!row) return;
      const kind = row.dataset.kind, id = row.dataset.id;
      let orig = null;
      if (kind === 'whole') orig = document.querySelector('#scoreList button[data-del="' + id + '"]');
      else if (kind === 'part') orig = document.querySelector('#mkList button[data-del="' + id + '"]');
      else if (kind === 'speaking') orig = document.querySelector('#mockHistoryList .mock-hist-del[data-id="' + id + '"]');
      if (orig) orig.click();
      setTimeout(render, 80);
    }));

    /* 详情：不复制详情内容（避免两套真相各说各话），而是把用户送到原来那个列表，
       并顺手展开对应的折叠块。 */
    box.querySelectorAll('.rec-det').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.rec-row');
      if (!row) return;
      const kind = row.dataset.kind;
      /* whole → 整卷本来就在 #scoreList（桌面折叠块里）
         part  → 分项在 #mkList（在「分项模考」区）
         speaking → 口语模考在 #mockHistoryList（在「口语」区） */
      const target = kind === 'part' ? '#mkList' : (kind === 'speaking' ? '#mockHistoryList' : '#scoreList');
      const el = document.querySelector(target);
      if (!el) return;
      const wrap = el.closest('details');
      if (wrap && !wrap.open) wrap.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  /* ---- 筛选 chip ---- */
  function initChips() {
    const wrap = document.getElementById('recAllChips');
    if (!wrap) return;
    wrap.querySelectorAll('.rvc').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      ACTIVE[k] = !ACTIVE[k];
      b.classList.toggle('active', ACTIVE[k]);
      render();
    }));
  }

  function boot() {
    if (inited) return;
    inited = true;
    initChips();
    render();
  }

  if (typeof ready === 'function') ready(boot);
  else if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  /* 数据变化时重画（软导航重跑本文件也会走到这里） */
  document.addEventListener('hub:data-merged', () => setTimeout(render, 50));

  window.RecAll = { render, collect };
})();
