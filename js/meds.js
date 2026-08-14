ready(() => {
  setMedInputsNow();
  $('#recordMed').addEventListener('click', recordMed);
  $('#resetMedTime').addEventListener('click', () => { setMedInputsNow(); toast('已重置为当前时间'); });
  renderMeds();
  setInterval(renderMeds, 30000);
});

function setMedInputsNow(){
  const d = new Date();
  // date input 用本地 YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  $('#medDate').value = `${y}-${m}-${day}`;
  $('#medTime').value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function readMedTsFromInputs(){
  const ds = $('#medDate').value; // YYYY-MM-DD
  const ts = $('#medTime').value; // HH:MM
  if(!ds || !ts){ throw new Error('请先选择日期和时间'); }
  const [y,m,d] = ds.split('-').map(Number);
  const [hh,mm] = ts.split(':').map(Number);
  return new Date(y, m-1, d, hh, mm, 0, 0).getTime();
}

function recordMed(){
  let ts;
  try{ ts = readMedTsFromInputs(); }
  catch(e){ toast(e.message); return; }
  if(ts > Date.now() + 60000){
    if(!confirm('这个时间在未来，确定要记录吗？')) return;
  }
  const tkey = todayKey(ts);
  DATA.meds.push({ id: uid(), date: tkey, ts });
  hubSave(); renderMeds(); toast('已记录服药');
}

function deleteMed(id){
  if(!confirm('确定要删除这条记录吗？')) return;
  DATA.meds = DATA.meds.filter(m => m.id !== id);
  hubSave(); renderMeds(); toast('已删除');
}

function editMed(id){
  const m = DATA.meds.find(x => x.id === id);
  if(!m) return;
  const d = new Date(m.ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  const newDs = prompt('修改日期（YYYY-MM-DD）', `${y}-${mo}-${da}`);
  if(newDs == null) return;
  const newTs = prompt('修改时间（HH:MM）', `${hh}:${mi}`);
  if(newTs == null) return;
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(newDs.trim());
  const m2 = /^(\d{1,2}):(\d{2})$/.exec(newTs.trim());
  if(!m1 || !m2){ toast('格式不正确，已取消'); return; }
  const [_,Y,M,D] = m1; const [__,H,MI] = m2;
  const newTsNum = new Date(Number(Y), Number(M)-1, Number(D), Number(H), Number(MI), 0, 0).getTime();
  if(newTsNum > Date.now() + 60000){
    if(!confirm('这个时间在未来，确定要修改吗？')) return;
  }
  m.ts = newTsNum;
  m.date = todayKey(newTsNum);
  hubSave(); renderMeds(); toast('已修改');
}

function renderMeds(){
  const tkey = todayKey();
  const todays = DATA.meds.filter(m => m.date === tkey).sort((a,b) => b.ts - a.ts);
  const status = $('#todayMedStatus');
  const barWrap = $('#medsBarWrap');
  if(todays.length === 0){
    status.innerHTML = '<span class="muted">今天还没记录服药。</span>';
    barWrap.hidden = true;
  } else {
    const latest = todays[0];
    const h = new Date(latest.ts).getHours(), mi = new Date(latest.ts).getMinutes();
    status.innerHTML = `今日已服药 ${todays.length} 次，最近一次 <strong>${pad2(h)}:${pad2(mi)}</strong>，预计 <strong>${expireStr(latest.ts)}</strong> 失效。`;
    barWrap.hidden = false;
    const elapsed = Date.now() - latest.ts;
    const pct = Math.min(100, elapsed / MED_DURATION_MS * 100);
    const remain = MED_DURATION_MS - elapsed;
    $('#medsBar').className = remain < 3600000 ? 'meds-bar low' : 'meds-bar';
    $('#medsBar').style.width = pct + '%';
    if(remain > 0){
      const rh = Math.floor(remain/3600000), rm = Math.floor((remain%3600000)/60000);
      $('#medsBarLabel').textContent = `药效剩余 ${rh}h${rm}m`;
    } else {
      $('#medsBarLabel').textContent = '药效已结束';
    }
  }

  const hist = DATA.meds.slice().sort((a,b) => b.ts - a.ts).slice(0,30);
  $('#medsHistory').innerHTML = hist.length ? hist.map(m => {
    const d = new Date(m.ts);
    return `<div class="list-item"><span>${m.date}</span><span>${pad2(d.getHours())}:${pad2(d.getMinutes())} 服药</span>` +
      `<span class="list-actions">` +
        `<button class="btn btn-sm" data-med-edit="${m.id}">修改</button>` +
        `<button class="btn btn-sm btn-danger" data-med-del="${m.id}">删除</button>` +
      `</span></div>`;
  }).join('') : renderEmpty('暂无记录。');

  document.querySelectorAll('[data-med-del]').forEach(b => {
    b.onclick = () => deleteMed(b.dataset.medDel);
  });
  document.querySelectorAll('[data-med-edit]').forEach(b => {
    b.onclick = () => editMed(b.dataset.medEdit);
  });
}
