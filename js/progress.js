/* 口语练习数据（纯展示层，不动 DATA 结构）。
   9/10 迁移：原「口语页 → 数据 tab」，现搬到「回顾页 → 口语 tab」下（之之要求），
   口语页的 tab / progressView / progress.js 引用已全部移除。
   由 review.html 的 <script defer> 加载，页面加载即自渲染（同 speaking-practice.js 约定）。
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

    // 各档位进度条（只显示数据里实际出现的档位）
    const order = ['ultra', 'high', 'medium', 'low'];
    const present = order.filter(f => list.some(s => s.frequency === f));
    let bars = '';
    present.forEach(f => {
      const grp = list.filter(s => s.frequency === f);
      const gd = grp.filter(practiced).length;
      const pct = grp.length ? Math.round(gd / grp.length * 100) : 0;
      bars += '<div class="prog-bar-row"><span class="freq-badge ' + f + '">' + (FREQ_LABEL[f] || f) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="bar-num">' + gd + '/' + grp.length + '</span></div>';
    });

    el.innerHTML =
      '<div class="prog-grid">'
      + '<div class="prog-card"><div class="n">' + total + '</div><div class="l">话题总数</div></div>'
      + '<div class="prog-card"><div class="n">' + doneTopics + '</div><div class="l">已练话题</div></div>'
      + '<div class="prog-card"><div class="n">' + coverage + '%</div><div class="l">覆盖率</div></div>'
      + '<div class="prog-card"><div class="n">' + totalPass + '</div><div class="l">总练习遍数</div></div>'
      + '</div>'

      + '<section class="card"><h2>各档位进度</h2>' + bars + '</section>'

      + '<section class="card"><h2>Part 分块</h2><div class="prog-part"><span>P1 已练 <b>' + p1Done + '</b>/' + p1Total + '</span><span>P2 已练 <b>' + p2Done + '</b>/' + p2Total + '</span><span>P1 练习 <b>' + list.filter(s => s.type !== 'P2').reduce((a, s) => a + countOf(s), 0) + '</b> 遍</span><span>P2 练习 <b>' + list.filter(s => s.type === 'P2').reduce((a, s) => a + countOf(s), 0) + '</b> 遍</span></div></section>'

      // design/17 3.5：句型闯关进度（x/y 读 patternDrill.sentences.status；总数从句型库取，取不到只显示 x）
      + '<section class="card"><h2>句型闯关</h2><div class="prog-part"><span>已掌握 <b id="sentProgMastered">' + sentProgMasteredText() + '</b></span><span>错题 <b>' + sentProgWrong() + '</b></span><a class="prog-sent-go" href="speaking.html?senttab=1" style="color:var(--primary,#3a9a93);text-decoration:none;font-weight:600">去练 →</a></div></section>';
    // 总数异步补齐（bank 未缓存时 fetch 一次，回填 x/35）
    if(!(window.__sentBankCache && window.__sentBankCache.cats)){
      fetch('data/sentences.json?v=20260912b').then(r => r.json()).then(b => {
        if(b && b.cats && b.cats.length){
          window.__sentBankCache = b;
          const nel = document.getElementById('sentProgMastered');
          if(nel) nel.textContent = sentProgMasteredText();
        }
      }).catch(() => {});
    }
  };

  /* design/17 3.5 helpers：句型闯关 x/y（全部读 patternDrill.sentences.status，库缺失时只显示 x） */
  function sentProgCounts(){
    const st = (DATA.patternDrill && DATA.patternDrill.sentences && DATA.patternDrill.sentences.status) || {};
    let m = 0, w = 0;
    // bank 已缓存时按 bank 遍历（孤儿 id 不计数，与句型页口径一致）
    if(window.__sentBankCache && window.__sentBankCache.cats){
      window.__sentBankCache.cats.forEach(cat => {
        cat.sentences.forEach(s => {
          const e = st[s.id];
          if(e && e.st === 'mastered') m++;
          else if(e && e.st === 'wrong') w++;
        });
      });
      return { m: m, w: w };
    }
    Object.keys(st).forEach(k => {
      if(st[k] && st[k].st === 'mastered') m++;
      else if(st[k] && st[k].st === 'wrong') w++;
    });
    return { m: m, w: w };
  }
  function sentProgMasteredText(){
    const c = sentProgCounts();
    let t = 0;
    if(window.__sentBankCache && window.__sentBankCache.cats){
      window.__sentBankCache.cats.forEach(cat => { t += cat.sentences.length; });
      return t ? (c.m + '/' + t) : String(c.m);
    }
    return String(c.m);
  }
  function sentProgWrong(){ return sentProgCounts().w; }

  // 自渲染（迁移后 #progressView 只在回顾页存在，加载即算一次）
  ready(() => { if (typeof window.renderProgress === 'function') window.renderProgress(); });
})();
