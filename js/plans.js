ready(() => {
  $('#planDate').value = todayKey();
  $('#planDate').addEventListener('change', render);
  $('#todayBtn').addEventListener('click', () => { $('#planDate').value = todayKey(); render(); });
  $('#addPlan').addEventListener('click', addItem);
  $('#planText').addEventListener('keydown', e => { if(e.key === 'Enter') addItem(); });
  render();
});

function currentDate(){ return $('#planDate').value || todayKey(); }

function getPlan(date){
  return DATA.plans.find(p => p.date === date);
}

function ensurePlan(date){
  let p = getPlan(date);
  if(!p){ p = { id: uid(), date, items: [] }; DATA.plans.push(p); }
  return p;
}

function addItem(){
  const text = $('#planText').value.trim();
  if(!text){ toast('先写点计划内容'); return; }
  const p = ensurePlan(currentDate());
  p.items.push({ id: uid(), text, done: false });
  hubSave();
  $('#planText').value = '';
  render();
}

function toggleItem(id){
  const p = getPlan(currentDate()); if(!p) return;
  const it = p.items.find(i => i.id === id); if(!it) return;
  it.done = !it.done;
  hubSave(); render();
}

function deleteItem(id){
  const p = getPlan(currentDate()); if(!p) return;
  p.items = p.items.filter(i => i.id !== id);
  hubSave(); render();
}

function render(){
  const date = currentDate();
  const p = getPlan(date);
  const items = p ? p.items : [];
  const done = items.filter(i => i.done).length;
  const total = items.length;

  $('#dateLabel').textContent = (date === todayKey() ? '今天 · ' : '') + date;
  $('#planCount').textContent = done + ' / ' + total;

  const pct = total ? done / total * 100 : 0;
  $('#planProgress').innerHTML = progressBar('完成进度', pct, 'var(--med)');

  const box = $('#planList');
  if(total === 0){
    box.innerHTML = renderEmpty('这天还没有计划，上面加一条吧。');
  } else {
    box.innerHTML = items.map(i => `
      <div class="plan-item ${i.done ? 'done' : ''}">
        <input type="checkbox" ${i.done ? 'checked' : ''} data-toggle="${i.id}" />
        <span class="plan-text">${escapeHtml(i.text)}</span>
        <button class="plan-del" data-del="${i.id}" title="删除">✕</button>
      </div>
    `).join('');
    box.querySelectorAll('input[data-toggle]').forEach(c =>
      c.addEventListener('change', () => toggleItem(c.dataset.toggle)));
    box.querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => deleteItem(b.dataset.del)));
  }

  renderHistory(date);
}

function renderHistory(curDate){
  const others = DATA.plans
    .filter(p => p.date !== curDate && p.items.length)
    .slice().sort((a,b) => b.date.localeCompare(a.date));
  const box = $('#histPlans');
  if(others.length === 0){
    box.innerHTML = renderEmpty('还没有其它日期的计划。');
    return;
  }
  box.innerHTML = others.map(p => {
    const done = p.items.filter(i => i.done).length;
    return `<div class="hist-plan" data-date="${p.date}">
      <span>${p.date}</span>
      <span class="badge">${done} / ${p.items.length} 完成</span>
    </div>`;
  }).join('');
  box.querySelectorAll('.hist-plan').forEach(el =>
    el.addEventListener('click', () => { $('#planDate').value = el.dataset.date; render(); }));
}

