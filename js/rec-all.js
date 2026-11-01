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
          /* 🔵 EXAM-E2（10-26）：这里原先只写 kind:'part' —— 于是 **整卷记录也被标成"分项"**，
             `data-kind` 永远不是 whole，「看上次结果/重新做一遍」按整卷选行时一条都命中不到（首跑实锤）。
             现在把原始粒度带出来（gran），渲染层据此决定要不要挂两个按钮；
             kind 保持 'part' 不动 —— 它同时被筛选 chip 与删除转发复用（whole 走 #scoreList），
             改它会连带影响删除路径，超出本批范围。 */
          gran: r.granularity || 'part',
          src: r.src || '',
          type: r.type || '',
          ids: Array.isArray(r.ids) ? r.ids.slice() : null,
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

  /* ---- 收起态（RV-RECALL-COL-1，10-27）----
     默认只渲染前 5 条 + 「展开全部 N 条」按钮；展开态渲染全量。
     · 筛选 chip 变化 → 强制回收起态（在 chip 回调里设 _recOpen=false 再 render）
     · ?rec= 命中收起态被藏的行 → 自动进入展开态（render 里检查）
     · 零持久化（刷新回收起 = 她要的「默认收起」） */
  let _recOpen = false;

  /* ---- 渲染 ---- */
  function render() {
    const box = document.getElementById('recAll');
    if (!box) return;
    const all = collect();
    const list = all.filter(x => ACTIVE[x.kind]);
    const cnt = document.getElementById('recAllCount');
    if (cnt) cnt.textContent = list.length ? ('共 ' + list.length + ' 条') : '';

    /* 🔴 RV-PAGE-REDESIGN-1（10-29 笔 B）：这一节现在是全页**唯一**的成绩记录列表
       （rvx 骨架里那份重复的「全部记录」已删），原来挂在它上面的三个计数
       （整卷 N / 分项 N / 口语模考 N）搬到这里，一个数字都没丢。 */
    try {
      const chips = document.getElementById('recAllChips');
      if (chips) {
        const names = { whole: '整卷', part: '分项', speaking: '口语模考' };
        const n = { whole: 0, part: 0, speaking: 0 };
        all.forEach(x => { if (n[x.kind] != null) n[x.kind]++; });
        chips.querySelectorAll('.rvc').forEach(b => {
          const k = b.dataset.k;
          if (n[k] == null) return;
          b.textContent = names[k] + ' ' + n[k];
        });
      }
    } catch (e) {}

    if (!all.length) {
      box.innerHTML = '<p class="muted" style="font-size:13.5px;margin:0">还没有任何记录。整卷、分项、口语模考都会汇总到这里，按日期排。</p>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<p class="muted" style="font-size:13.5px;margin:0">当前筛选下没有记录，点上面的标签把它勾回来。</p>';
      return;
    }

    /* ?rec= 命中收起态被藏的行 → 自动展开 */
    try {
      var _rid = '';
      try{ _rid = new URLSearchParams(location.search).get('rec') || ''; }catch(e){}
      if (_rid) {
        var _idx = list.findIndex(function(x){ return String(x.id) === String(_rid); });
        if (_idx >= 0 && _idx > 4) _recOpen = true;  // 命中行在前 5 里也不用展开
      }
    } catch(e) {}

    /* 少于 5 条时不用按钮（全渲染） */
    var truncated = list.length > 5 && !_recOpen;
    var showList = truncated ? list.slice(0, 5) : list;

    box.innerHTML = showList.map(x => {
      const k = KINDS[x.kind] || KINDS.whole;
      /* EXAM-E2P（10-26）：补 data-rec-id —— 「看上次结果」要能按 id 定位到这一行。
         data-id 原来就有（删除/详情转发用它），两者同一个值，但语义分开：
         data-id 是"操作目标"，data-rec-id 是"定位锚点"（E-2 接 ?rec= 时只认它）。 */
      return '<div class="rec-row rk-' + x.kind + '" data-id="' + esc(x.id) + '" data-rec-id="' + esc(x.id) + '" data-kind="' + x.kind + '"'
        + (x.gran ? ' data-gran="' + esc(x.gran) + '"' : '') + '>'
        + '<span class="rec-d">' + esc(x.date) + '</span>'
        + '<span class="rec-k ' + k.cls + '">' + k.label + '</span>'
        + '<span class="rec-t">' + esc(x.title) + '</span>'
        + '<span class="rec-s"><b>' + esc(x.main) + '</b><i>' + x.mainLabel + '</i></span>'
        + '<span class="rec-o"><button type="button" class="btn sm rec-det" data-id="' + esc(x.id) + '">详情</button>'
        + '<button type="button" class="btn sm danger rec-del" data-id="' + esc(x.id) + '">删除</button></span>'
        + '</div>';
    }).join('');

    /* RV-RECALL-COL-1：展开/收起按钮 */
    if (truncated || (_recOpen && list.length > 5)) {
      var btnLabel = _recOpen ? '收起' : ('展开全部 ' + list.length + ' 条');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sm btn-primary rec-toggle';
      btn.style.cssText = 'display:block;margin:12px auto 0;min-height:36px';
      btn.textContent = btnLabel;
      btn.addEventListener('click', function(){
        _recOpen = !_recOpen;
        render();
      });
      box.appendChild(btn);
    }

    /* EXAM-E2P（10-26）：?rec=<id> 定位 —— 渲染后按 data-rec-id 找到行、滚到中间、轻高亮 2 秒。
       · 找不到（记录被删 / 老书签 / 参数乱写）→ **不报错、不滚动**，页面照常（这条是硬要求）
       · 高亮是临时的，2 秒后自己淡掉，不许永久改变这条行的样子
       · 只在一次页面生命里跑一次（window 标记），软导航重跑不会反复滚来滚去 */
    try{
      if(!window.__recFocusDone){
        window.__recFocusDone = true;
        var _rid = '';
        try{ _rid = new URLSearchParams(location.search).get('rec') || ''; }catch(e){ _rid = ''; }
        if(_rid){
          var row = box.querySelector('.rec-row[data-rec-id="' + String(_rid).replace(/["\\\\]/g, '') + '"]');
          if(row){
            window.__lastScrollTarget = _rid;
            try{ row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }catch(e){ row.scrollIntoView(); }
            row.classList.add('rec-focus');
            setTimeout(function(){ try{ row.classList.remove('rec-focus'); }catch(e){} }, 2000);
          }
        }
      }
    }catch(e){}

    /* ===== EXAM-E2（10-26）：整卷记录行上加两个按钮 =====
       🔴 挂这里而不是挂 scores.js 的 #mkList：RV-CLEAN-1 把 #tab-breakdown 整块藏了，
          整卷/分项记录列表（#scoreList / #mkList）现在**看不见也点不到** ——
          「全部记录」#recAll 才是这一页唯一可见的记录入口（RV-CLEAN-1b 专门把它搬出来就是为这个）。
       · 只给**整卷 + src:bank**（单篇走原有「再做一次」那条路，不重复给）
       · 看上次结果 → review.html?rec=<id>（本页自己就是回顾页，用软导航同页重跑脚本读 ?rec=）
       · 重新做一遍 → window.__hubOpenFullTestFromIds(ids)（E-2P 暴露的入口，与点 Start 同一条路径）
       · 老记录没 ids → 按钮**照样显示**，点了先 confirm 说明降级；不藏按钮、不静默随机（B 明令）
       幂等：每次 render 重建 DOM，绑定前用元素标记挡重复。 */
    box.querySelectorAll('.rec-row[data-gran="whole"]').forEach(function(rowEl){
      const rid = rowEl.dataset.recId || '';
      if(rowEl.querySelector('.rec-redo')) return;
      /* 直接用 collect 时带出来的字段，别去 DATA 里二次比对（同 id 可能被筛选/覆盖） */
      const item = list.find(function(x){ return x && String(x.id) === rid; });
      if(!item || item.src !== 'bank') return;
      const hasIds = Array.isArray(item.ids) && item.ids.length === 3;
      const recType = item.type || 'reading';
      const span = document.createElement('span');
      span.className = 'rec-redo';
      span.innerHTML = '<button type="button" class="btn sm rec-last">看上次结果</button>'
        + '<button type="button" class="btn sm rec-again">重新做一遍</button>';
      const acts = rowEl.querySelector('.rec-o');
      if(acts && acts.parentNode) acts.parentNode.insertBefore(span, acts); else rowEl.appendChild(span);
      const lb = span.querySelector('.rec-last');
      const ab = span.querySelector('.rec-again');
      if(lb) lb.addEventListener('click', function(){
        if(!rid) return;
        location.href = 'review.html?rec=' + encodeURIComponent(rid);
      });
      if(ab) ab.addEventListener('click', function(){
        const opener = window.__hubOpenFullTestFromIds;
        if(typeof opener !== 'function'){ alert('重做入口还没就绪，请刷新页面后再试。'); return; }
        if(recType === 'listening'){
          alert('听力整卷重做会在下一批开放。现在可以点「看上次结果」看那场的成绩与错题。');
          return;
        }
        if(!hasIds){
          if(!confirm('这场是老记录，当时没存用的是哪几篇，将随机组一套新的。\n新卷和这场成绩不能直接比，继续？')) return;
          opener(null);
          return;
        }
        if(!opener(item.ids)){
          if(confirm('这套卷里有篇目已经找不到了（题库更新过），重做只能随机组一套新的。继续？')){
            opener(null);
          }
        }
      });
    });

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
      _recOpen = false;  // RV-RECALL-COL-1：筛选变化回到收起态
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
