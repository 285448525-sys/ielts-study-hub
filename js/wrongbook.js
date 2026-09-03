// ===== 错句本：聚合写作模板默写 + 语料库表格默写的错误句子 =====
// 复用 common.js 的 collectWrongSentences / deleteWrongItem

let wbSearch = '';
ready(() => {
  const ws = document.getElementById('wbSearch');
  if(ws) ws.addEventListener('input', () => { wbSearch = ws.value.trim().toLowerCase(); renderWrongbook(); });
  renderWrongbook();
  $('#wbSourceFilter').addEventListener('change', renderWrongbook);
});

function renderWrongbook(){
  const all = collectWrongSentences();
  // 来源筛选下拉
  const filterSel = $('#wbSourceFilter');
  const sources = [];
  all.forEach(x => { if(sources.indexOf(x.sourceId) < 0) sources.push(x.sourceId); });
  const cur = filterSel.value;
  filterSel.innerHTML = '<option value="all">全部</option>' + sources.map(s =>
    '<option value="' + escapeHtml(s) + '">' + escapeHtml(sourceLabel(s)) + '（' + all.filter(x => x.sourceId === s).length + '）</option>'
  ).join('');
  if(cur && (cur === 'all' || sources.indexOf(cur) >= 0)) filterSel.value = cur;

  const list = cur && cur !== 'all' ? all.filter(x => x.sourceId === cur) : all;
  if(wbSearch){ list = list.filter(it => ((it.right||'')+' '+(it.wrong||'')+' '+(it.note||'')+' '+sourceLabel(it.sourceId)).toLowerCase().indexOf(wbSearch) !== -1); }
  $('#wbCount').textContent = list.length;
  $('#wbEmpty').hidden = list.length > 0;

  $('#wbList').innerHTML = list.map(it => `
    <div class="wb-item" data-key="${escapeHtml(it.key)}" style="padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span class="badge" style="background:var(--bg)">${escapeHtml(sourceLabel(it.sourceId))}</span>
        ${it.count > 1 ? '<span class="dict-weak-tag" title="错 ' + it.count + ' 次">★×' + it.count + '</span>' : ''}
        <span class="muted" style="font-size:12.5px">最近 ${escapeHtml(it.lastDate || '')}</span>
        <button class="btn btn-sm wb-del" data-key="${escapeHtml(it.key)}" type="button" style="margin-left:auto">删除</button>
      </div>
      <div style="font-size:14.5px;line-height:1.7">正确：<code style="font-size:14px">${escapeHtml(it.right)}</code></div>
      ${it.wrong ? '<div class="muted" style="font-size:13px;margin-top:3px">你写：' + escapeHtml(it.wrong) + '</div>' : '<div class="muted" style="font-size:13px;margin-top:3px">（漏写）</div>'}
      ${it.note ? '<div class="muted" style="font-size:12.5px;margin-top:3px">' + escapeHtml(it.note) + '</div>' : ''}
    </div>`).join('');

  $('#wbList').querySelectorAll('.wb-del').forEach(b => {
    b.addEventListener('click', () => {
      if(!confirm('从错句本删除这条？（不影响原默写记录）')) return;
      deleteWrongItem(b.dataset.key);
      renderWrongbook();
      toast('已删除');
    });
  });
}

// sourceId → 可读标签
function sourceLabel(id){
  if(id === 'corpus') return '语料库表格默写';
  if(id && id.indexOf('tpl_') === 0){
    const tplId = id.slice(4);
    const t = (DATA.writing || []).find(x => x.id === tplId);
    return t ? ('写作模板 · ' + (typeof cleanCatName === 'function' ? cleanCatName(t.title) : t.title)) : ('写作模板 ' + tplId);
  }
  return id || '未知来源';
}
