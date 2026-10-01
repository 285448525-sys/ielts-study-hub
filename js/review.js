/* 回顾页（合并页）：软导航时由 common.js 的 runPageScript('review') 调用。
   本页同时承载 scores（模考成绩）+ history（学习轨迹）+ 口语两块，没有单一业务脚本，
   四个业务模块（scores / history / mock-history / speaking-practice）在 review.html 的
   <head> 里都用带 ?v= 的 <script defer> 声明好了，runPageScript 会按声明顺序重新 eval 它们，
   而它们各自末尾都有 ready() 自动渲染 —— 也就是说，本文件其实不需要再拉任何源码。

   ⚠️ 2026-09-17 修复「第一次进去是旧页面、Ctrl+F5 才变新、过一会又变旧」：
   本文件原本自己 fetch('js/scores.js', { cache:'force-cache' }) 把源码拉回来 eval。
   那个 URL 不带 ?v= 版本号 → 命中的是浏览器 HTTP 缓存里任意年代的旧副本，eval 之后
   把 runPageScript 刚按 review.html 声明（?v=新）装好的同名函数整体覆盖回去，
   最后再手动调一次 render → 稳定渲染出旧 UI。
   而整页加载路径根本不跑本文件（review.js 原本不在 review.html 的 <script> 里），
   所以硬刷新永远是对的 —— 症状与现象完全对得上。

   现在的职责收窄为「幂等兜底协调器」：保证两块内容最终一定被渲染出来，
   谁先渲染的不重要，重复渲染也不会叠加事件（容器 content 是整体重建的）。
   不再发起任何无版本号请求。 */
(function () {
  // 等到校验函数为真（软导航下紧跟的 eval 循环会同步把模块装进来，通常下一拍就命中）
  async function waitUntil(test, ms) {
    const end = Date.now() + (ms || 3000);
    while (Date.now() < end) {
      let ok = false;
      try { ok = !!test(); } catch (e) { ok = false; }
      if (ok) return true;
      await new Promise(r => setTimeout(r, 40));
    }
    return false;
  }
  const filled = el => !!(el && String(el.innerHTML || '').trim());

  // ① 口语整卷模考历史（mock-history.js）
  async function ensureMockHistory() {
    const list = document.getElementById('mockHistoryList');
    if (!list) return;
    await waitUntil(() => window.MockHistory && typeof window.MockHistory.render === 'function');
    if (!window.MockHistory || typeof window.MockHistory.render !== 'function') return;
    if (filled(list)) return;                     // ready() 已渲染过 → 不重复重建 DOM
    window.MockHistory.render(list, { countEl: document.getElementById('mockHistCount') });
  }

  // ② 口语单题日常练习沉淀（speaking-practice.js）
  async function ensureSpeakingPractice() {
    if (typeof waitUntil !== 'function') return;
    await waitUntil(() => typeof window.renderSpeakingPractice === 'function');
    if (typeof window.renderSpeakingPractice !== 'function') return;
    const box = document.getElementById('spPracticeList');
    if (filled(box)) return;
    window.renderSpeakingPractice();
  }

  // ③ 轨迹折叠（她 10/1 拍板：每日记录/口语练习默认折叠，展开态 sessionStorage 本会话记忆）
  function initRvFold() {
    const KEY = 'hub_rev_fold';
    let st = {};
    try { st = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) {}
    const secs = document.querySelectorAll('.rv-fold');
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i];
      const key = sec.getAttribute('data-foldkey');
      const head = sec.querySelector('.rv-fold-head');
      const body = sec.querySelector('.rv-fold-body');
      if (!key || !head || !body) continue;
      const apply = open => { sec.classList.toggle('open', open); body.hidden = !open; };
      apply(st[key] === true);
      head.addEventListener('click', () => {
        const open = body.hidden;
        apply(open);
        st[key] = open;
        try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
      });
    }
  }

  // ④ 弱项诊断（10/1 晚 Landing 卖点对版：任何时候都显示，不依赖考试日期）
  //    用 MOCK_TYPES + BAND_TABLE + estimateBand（common.js 已装），
  //    取近 30 天 mockRecords 分桶估科 → 对比目标分 → 最弱科行动建议
  function renderWeakness(){
    const host = document.getElementById('dashWeakness');
    if(!host) return;
    try{
      const records = ((DATA && DATA.mockRecords) || []).slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const targets = (((DATA && DATA.settings) || {}).targets) || {};
      const SKILLS = ['listening','reading','writing','speaking'];
      const LABEL = { listening:'听力', reading:'阅读', writing:'写作', speaking:'口语' };
      const ICONS = { listening:'🎧', reading:'📖', writing:'✏️', speaking:'🗣' };
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth()+1).padStart(2,'0') + '-' + String(cutoff.getDate()).padStart(2,'0');

      function recentLevel(kind){
        let any = false;
        const buckets = {};
        const fallback = { level: null, fromDate: null };
        for(const r of records){
          const isSp = (r.kind === 'speaking');
          const ty = isSp ? 'speaking' : r.type;
          if(ty !== kind) continue;
          const date = String(r.date || '');
          if(isSp){
            const ov = parseFloat(r.overall);
            if(!isNaN(ov)){
              if(!fallback.level || date > fallback.fromDate){ fallback.level = ov; fallback.fromDate = date; }
              if(date >= cutoffStr){ any = true; return ov; }
            }
            continue;
          }
          const cfg = MOCK_TYPES[ty]; if(!cfg) continue;
          // buckets
          for(const p of (r.parts || [])){
            if(!p || !p.label) continue;
            const b = buckets[p.label] || (buckets[p.label] = { n:0, c:0, tot:0, s:0, w:0 });
            if(typeof p.score === 'number'){
              b.s += p.score; b.w += typeof partWeight === 'function' ? partWeight(cfg, p.label) : 1; b.n += 1;
            } else if(typeof p.correct === 'number' && typeof p.total === 'number' && p.total > 0){
              b.c += p.correct; b.tot += p.total; b.n += 1;
            }
          }
          if(!fallback.level){
            // 单条独立估分（fallback 用最近一条的 bandFromRec）
            try{
              const parts = Array.isArray(r.parts) ? r.parts : [];
              let lv = null;
              if(cfg.mode === 'score'){
                let num = 0, den = 0;
                parts.forEach(p => {
                  if(typeof p.score === 'number'){ const w = typeof partWeight === 'function' ? partWeight(cfg, p.label) : 1; num += p.score * w; den += w; }
                });
                if(den > 0) lv = num / den;
              } else {
                let c = 0, t = 0;
                parts.forEach(p => { if(typeof p.correct === 'number' && typeof p.total === 'number'){ c += p.correct; t += p.total; } });
                if(t > 0 && typeof estimateBand === 'function') lv = estimateBand(ty, c, t);
              }
              if(lv != null){ fallback.level = lv; fallback.fromDate = date; }
            }catch(e){}
          }
          if(date >= cutoffStr) any = true;
        }
        if(any){
          // 30 天内的数据用分桶估
          const bucketed = {};
          for(const r of records){
            if(r.kind === 'speaking') continue;
            const ty = r.type;
            if(ty !== kind) continue;
            const date = String(r.date || '');
            if(date < cutoffStr) continue;
            const cfg = MOCK_TYPES[ty]; if(!cfg) continue;
            const bk = bucketed;
            for(const p of (r.parts || [])){
              if(!p || !p.label) continue;
              const b = bk[p.label] || (bk[p.label] = { n:0, c:0, tot:0, s:0, w:0 });
              if(typeof p.score === 'number'){
                b.s += p.score; b.w += typeof partWeight === 'function' ? partWeight(cfg, p.label) : 1; b.n += 1;
              } else if(typeof p.correct === 'number' && typeof p.total === 'number' && p.total > 0){
                b.c += p.correct; b.tot += p.total; b.n += 1;
              }
            }
          }
          const cfg = MOCK_TYPES[kind];
          if(bucketed && cfg){
            if(cfg.mode === 'score'){
              let num = 0, den = 0;
              Object.keys(bucketed).forEach(k => {
                const b = bucketed[k];
                if(b.n > 0 && b.w > 0){ const w = b.w / b.n; num += (b.s / b.n) * w; den += w; }
              });
              if(den > 0) return { level: num / den, fromDate: cutoffStr };
            } else {
              let sum = 0, tot = 0;
              Object.keys(bucketed).forEach(k => {
                const b = bucketed[k];
                if(b.n > 0){ sum += b.c / b.n; tot += b.tot / b.n; }
              });
              if(tot > 0 && typeof estimateBand === 'function') return { level: estimateBand(kind, sum, tot), fromDate: cutoffStr };
            }
          }
        }
        if(fallback.level != null) return fallback;
        return { level: null, fromDate: null };
      }

      // 收集四科数据
      const hasTarget = SKILLS.some(k => Number(targets[k]) > 0);
      const hasData = records.length > 0;
      if(!hasData){
        host.innerHTML = '<h2 style="margin:0 0 10px">💡 你的弱项</h2>'
          + '<p class="muted" style="margin:0;font-size:13px">还没录入过能估分的模考记录（整卷或单项都行）。在下方「添加分项记录」录一条，这里会自动算出你哪科最弱。</p>';
        return;
      }
      if(!hasTarget){
        host.innerHTML = '<h2 style="margin:0 0 10px">💡 你的弱项</h2>'
          + '<p class="muted" style="margin:0;font-size:13px">还没设目标分数，去<a href="settings.html">设置</a>填一下，这里会按科算差距。</p>';
        return;
      }
      const rows = [];
      SKILLS.forEach(k => {
        const t = Number(targets[k]) || 0;
        if(!t) return;
        const lv = recentLevel(k);
        if(lv.level == null) return;
        const gap = Math.round((lv.level - t) * 2) / 2;
        rows.push({ k, label: LABEL[k], icon: ICONS[k], level: lv.level, target: t, gap });
      });
      if(rows.length === 0){
        host.innerHTML = '<h2 style="margin:0 0 10px">💡 你的弱项</h2>'
          + '<p class="muted" style="margin:0;font-size:13px">目标已设，但近 30 天没有对应科目的模考记录。去下方录一条，这里自动帮你找差距。</p>';
        return;
      }
      rows.sort((a, b) => a.gap - b.gap);
      const worst = rows[0];
      let html = '<h2 style="margin:0 0 10px">💡 你的弱项</h2><div style="margin-bottom:10px;font-size:13px;color:var(--muted)">按近 30 天模考记录估分，对比目标分找差距</div>';
      html += rows.map(r => {
        const isWorst = r === worst && r.gap < 0;
        const tag = r.gap < 0 ? '还差 ' + Math.abs(r.gap).toFixed(1) + ' 分'
                  : (r.gap > 0 ? '已超 ' + r.gap.toFixed(1) + ' 分' : '已达标');
        const cls = r.gap < 0 ? 'down' : 'up';
        return '<div class="gap-row' + (isWorst ? ' gap-worst' : '') + '">'
          + '<span class="gap-ic">' + r.icon + '</span>'
          + '<span class="gap-name">' + r.label + '</span>'
          + '<span class="gap-val">' + r.level.toFixed(1) + ' / 目标 ' + r.target.toFixed(1) + '</span>'
          + '<span class="badge ' + cls + ' gap-tag">' + tag + '</span>'
          + '</div>';
      }).join('');
      if(worst.gap < 0){
        html += '<p style="margin:10px 0 0;font-size:13.5px">💡 最大缺口是 <b>' + worst.label + '</b>（差 ' + Math.abs(worst.gap).toFixed(1) + ' 分），建议优先练。</p>';
      } else {
        html += '<p style="margin:10px 0 0;font-size:13.5px">🎉 四项均已达目标，保持节奏即可～</p>';
      }
      host.innerHTML = html;
    }catch(e){
      host.innerHTML = '';
    }
  }

  ready(() => {
    ensureMockHistory();
    ensureSpeakingPractice();
    initRvFold();
    renderWeakness();
    // 云端合并后数据可能变（另一台设备刚录了成绩），重渲弱项诊断
    document.addEventListener('hub:data-merged', renderWeakness);
    document.addEventListener('hub:session-saved', renderWeakness);
  });
})();
