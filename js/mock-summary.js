/* 回顾页 · 口语模考「错误总结」模块
   聚合所有口语整卷模考记录（DATA.mockRecords，kind==='speaking'）里的逐题语法/用词纠错（fixes），
   调用 DeepSeek 归并成「错误类型 → 出现次数」，并给出最高频 / 需重点修改 / 频繁程度说明。
   仅在用户点击「生成总结」时调用（省配额、不自动打扰）。 */
(function(){
  // 收集全部历史纠错条目：每条 { wrong, correct, note }（来自各 Part 的 fixes）
  function collectErrors(){
    const out = [];
    (DATA.mockRecords || []).forEach(rec => {
      if(!rec || (rec.kind !== 'speaking' && !(Array.isArray(rec.parts) && rec.p1))) return;
      const parts = rec.parts;
      if(!parts) return;
      ['p1','p2','p3'].forEach(k => {
        const p = parts[k];
        if(p && Array.isArray(p.fixes)){
          p.fixes.forEach(f => {
            if(!f || !Array.isArray(f.errors)) return;
            f.errors.forEach(e => {
              out.push({
                q: f.q || '',
                wrong: e.wrong || '',
                correct: e.correct || '',
                note: e.note || ''
              });
            });
          });
        }
      });
    });
    return out;
  }

  const EH = (typeof escapeHtml === 'function')
    ? escapeHtml
    : (s => String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

  async function generate(btn, box){
    if(!DATA.settings.relayToken){
      box.innerHTML = '<p class="muted">请先在「设置 / AI 接口」填写 DeepSeek Key 后再生成总结。</p>';
      return;
    }
    const errs = collectErrors();
    if(!errs.length){
      box.innerHTML = '<p class="muted">还没有任何模考纠错记录，先去「口语 → 模考」完成几场，再来生成总结。</p>';
      return;
    }
    box.innerHTML = '<p class="muted">正在统计 ' + errs.length + ' 条纠错记录并请 AI 归纳…</p>';
    if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }

    // 精简喂给 AI 的条目：只给 wrong / correct / note（note 往往已包含错误类型说明）
    const sample = errs.slice(0, 200).map(e => ({
      wrong: e.wrong,
      correct: e.correct,
      note: e.note
    }));

    const sys = 'You are an IELTS speaking error analyst. The candidate has done several mock speaking exams. '
      + 'Below is a list of their grammar / vocabulary errors (wrong form, corrected form, and a short note). '
      + 'Your job: group these errors into error TYPES (e.g. "时态错误", "冠词缺失", "主谓一致", "介词误用", "词性误用", "搭配错误"), '
      + 'count how many times each type appears, then identify the MOST FREQUENT types and the ones that most need focused fixing. '
      + 'Also describe how frequent each top type is (e.g. "出现非常频繁，几乎每场都有" / "较常出现" / "偶尔出现"). '
      + 'Output ONLY JSON: {"summary":"一句话整体说明","topErrors":[{"type":"错误类型","count":数字,"freqDesc":"频繁程度说明(中文)","advice":"针对该类型的一句改进建议(中文)"}]}. '
      + 'Sort topErrors by count descending, include at most 8 types. Do not output anything else.';
    const user = 'Error list (JSON array of {wrong, correct, note}):\n\n' + JSON.stringify(sample);

    try{
      const content = await callRelay('mock_summary', [
        { role:'system', content:sys },
        { role:'user', content:user }
      ], 0.4);
      const j = aiJson(content);
      if(!j || !Array.isArray(j.topErrors)) throw new Error('AI 返回格式异常');
      renderSummary(box, j, errs.length);
    }catch(e){
      box.innerHTML = '<p class="muted">总结生成失败：' + EH(e.message) + '。可稍后重试。</p>';
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '重新生成总结'; }
    }
  }

  function renderSummary(box, j, totalCount){
    const items = j.topErrors.map((t, i) => {
      const cnt = Number(t.count) || 0;
      const pct = totalCount ? Math.round(cnt / totalCount * 100) : 0;
      const barColor = i === 0 ? 'var(--primary-d)' : (i < 3 ? 'var(--primary)' : 'var(--line-strong)');
      return '<div class="ms-sum-item">'
        + '<div class="ms-sum-row"><span class="ms-sum-type">' + EH(t.type || '未命名类型') + '</span>'
        + '<span class="ms-sum-count">出现 ' + cnt + ' 次 · ' + pct + '%</span></div>'
        + '<div class="ms-sum-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + barColor + '"></i></div>'
        + '<div class="ms-sum-freq">' + EH(t.freqDesc || '') + '</div>'
        + (t.advice ? '<div class="ms-sum-advice">💡 ' + EH(t.advice) + '</div>' : '')
        + '</div>';
    }).join('');

    box.innerHTML = '<p class="ms-sum-overall">' + EH(j.summary || '') + '</p>'
      + '<p class="muted" style="margin:-2px 0 10px">基于 ' + totalCount + ' 条历史纠错记录自动归纳（最高频 / 需重点修改的错误类型）。</p>'
      + '<div class="ms-sum-list">' + (items || '<span class="muted">无</span>') + '</div>';
  }

  window.MockSummary = { generate, collectErrors };

  if(typeof ready === 'function'){
    ready(() => {
      const btn = document.getElementById('mockSummaryBtn');
      const box = document.getElementById('mockSummaryBox');
      if(btn && box){
        btn.addEventListener('click', () => generate(btn, box));
      }
    });
  }
})();
