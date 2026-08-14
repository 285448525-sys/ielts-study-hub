let ebEditId = null;
let rev = null;

ready(() => {
  $('#addBtn').addEventListener('click', () => openForm());
  $('#reviewBtn').addEventListener('click', startReview);
  $('#revExit').addEventListener('click', exitReview);
  ['fKind','fSubject','fQtype','fTrap'].forEach(id => $('#'+id).addEventListener('change', render));
  render();
});

function openForm(entry){
  ebEditId = entry ? entry.id : null;
  const isEdit = !!entry;
  const e = entry || { kind:'question', subject:'reading', section:'', qtype:'TFNG', trap:'FALSE_NG混淆', stem:'', locate:'', original:'', wrong:'', right:'', note:'', en:'', cn:'' };
  const area = $('#formArea');
  area.hidden = false;
  area.innerHTML = `
    <h3>${isEdit?'编辑记录':'新增记录'}</h3>
    <div class="form-row">
      <select id="f_kind">
        <option value="question" ${e.kind==='question'?'selected':''}>题目（错题诊断）</option>
        <option value="word" ${e.kind==='word'?'selected':''}>单词（生词 / 记不住）</option>
      </select>
    </div>
    <div id="wordFields" ${e.kind==='word'?'':'hidden'}>
      <div class="form-row">
        <input id="f_en" placeholder="英文单词" value="${escapeHtml(e.en||'')}"/>
        <input id="f_cn" placeholder="中文释义" value="${escapeHtml(e.cn||'')}"/>
      </div>
    </div>
    <div id="qFields" ${e.kind==='question'?'':'hidden'}>
      <div class="form-row">
        <select id="f_subject">
          <option value="reading" ${e.subject==='reading'?'selected':''}>阅读</option>
          <option value="listening" ${e.subject==='listening'?'selected':''}>听力</option>
        </select>
        <input id="f_section" placeholder="篇章/题号，如 P1-3 / S4-Q12" value="${escapeHtml(e.section||'')}"/>
      </div>
      <div class="form-row">
        <select id="f_qtype">
          <option value="TFNG" ${e.qtype==='TFNG'?'selected':''}>TRUE/FALSE/NOT GIVEN</option>
          <option value="填空" ${e.qtype==='填空'?'selected':''}>填空</option>
          <option value="匹配" ${e.qtype==='匹配'?'selected':''}>匹配</option>
          <option value="选择" ${e.qtype==='选择'?'selected':''}>选择</option>
          <option value="简答" ${e.qtype==='简答'?'selected':''}>简答</option>
          <option value="heading" ${e.qtype==='heading'?'selected':''}>Heading</option>
          <option value="其他" ${e.qtype==='其他'?'selected':''}>其他</option>
        </select>
        <select id="f_trap">
          <option value="目的vs手段" ${e.trap==='目的vs手段'?'selected':''}>目的vs手段</option>
          <option value="原词重现" ${e.trap==='原词重现'?'selected':''}>原词重现</option>
          <option value="比较级NG" ${e.trap==='比较级NG'?'selected':''}>比较级NG</option>
          <option value="FALSE_NG混淆" ${e.trap==='FALSE_NG混淆'?'selected':''}>FALSE/NOT GIVEN混淆</option>
          <option value="定位丢失" ${e.trap==='定位丢失'?'selected':''}>定位丢失</option>
          <option value="拼写" ${e.trap==='拼写'?'selected':''}>拼写</option>
          <option value="其他" ${e.trap==='其他'?'selected':''}>其他</option>
        </select>
      </div>
      <textarea id="f_stem" placeholder="题干">${escapeHtml(e.stem||'')}</textarea>
      <textarea id="f_locate" placeholder="定位词">${escapeHtml(e.locate||'')}</textarea>
      <textarea id="f_original" placeholder="原文对应句">${escapeHtml(e.original||'')}</textarea>
      <div class="form-row">
        <textarea id="f_wrong" placeholder="错选 / 错答">${escapeHtml(e.wrong||'')}</textarea>
        <textarea id="f_right" placeholder="正解">${escapeHtml(e.right||'')}</textarea>
      </div>
    </div>
    <textarea id="f_note" placeholder="复盘心得（可选）">${escapeHtml(e.note||'')}</textarea>
    <div class="form-row" style="align-items:flex-end">
      <button class="btn btn-primary" id="saveBtn">${isEdit?'保存修改':'保存记录'}</button>
      <button class="btn" id="cancelBtn">取消</button>
    </div>`;
  $('#f_kind').addEventListener('change', ev => {
    const word = ev.target.value === 'word';
    $('#wordFields').hidden = !word;
    $('#qFields').hidden = word;
  });
  $('#saveBtn').addEventListener('click', saveEntry);
  $('#cancelBtn').addEventListener('click', () => { area.hidden = true; });
}

function saveEntry(){
  const kind = $('#f_kind').value;
  const base = { id: ebEditId || uid(), date: todayKey(), known: ebEditId ? (getById(ebEditId)||{}).known || false : false, note: $('#f_note').value.trim() };
  let entry;
  if(kind === 'word'){
    const en = $('#f_en').value.trim();
    if(!en){ toast('请填英文单词'); return; }
    entry = Object.assign(base, { kind:'word', en, cn: $('#f_cn').value.trim() });
  } else {
    const stem = $('#f_stem').value.trim();
    if(!stem){ toast('请填题干'); return; }
    entry = Object.assign(base, {
      kind:'question',
      subject: $('#f_subject').value,
      section: $('#f_section').value.trim(),
      qtype: $('#f_qtype').value,
      trap: $('#f_trap').value,
      stem,
      locate: $('#f_locate').value.trim(),
      original: $('#f_original').value.trim(),
      wrong: $('#f_wrong').value.trim(),
      right: $('#f_right').value.trim()
    });
  }
  if(ebEditId){
    const i = DATA.errorbook.findIndex(x => x.id === ebEditId);
    if(i >= 0) DATA.errorbook[i] = entry;
  } else {
    DATA.errorbook.unshift(entry);
  }
  hubSave();
  $('#formArea').hidden = true;
  render();
  toast(ebEditId ? '已更新' : '已记录');
}

function getById(id){ return DATA.errorbook.find(x => x.id === id); }

function render(){
  const fk = $('#fKind').value, fs = $('#fSubject').value, fq = $('#fQtype').value, ft = $('#fTrap').value;
  let list = DATA.errorbook.filter(e =>
    (!fk || e.kind === fk) &&
    (!fs || e.subject === fs) &&
    (!fq || e.qtype === fq) &&
    (!ft || e.trap === ft)
  );
  list.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  $('#count').textContent = list.length;
  const box = $('#list');
  if(list.length === 0){
    box.innerHTML = '';
    $('#empty').hidden = (DATA.errorbook.length > 0);
  } else {
    $('#empty').hidden = true;
    box.innerHTML = list.map(cardHtml).join('');
    box.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(getById(b.dataset.edit))));
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if(confirm('确定删除这条记录？')){ DATA.errorbook = DATA.errorbook.filter(x => x.id !== b.dataset.del); hubSave(); render(); }
    }));
  }
  renderStats();
}

function cardHtml(e){
  const badge = e.kind === 'word'
    ? '<span class="badge">单词</span>'
    : `<span class="badge">${e.subject==='reading'?'阅读':'听力'}</span><span class="badge">${escapeHtml(e.qtype)}</span><span class="badge badge-trap">${escapeHtml(e.trap)}</span>`;
  const main = e.kind === 'word'
    ? `<div class="eb-main"><b>${escapeHtml(e.en)}</b> ${escapeHtml(e.cn)}</div>`
    : `<div class="eb-main"><b>${escapeHtml(e.stem)}</b></div>
       <div class="eb-sub">定位：${escapeHtml(e.locate||'—')}　|　原文：${escapeHtml(e.original||'—')}</div>
       <div class="eb-sub">错：${escapeHtml(e.wrong||'—')}　→　正：${escapeHtml(e.right||'—')}</div>`;
  const note = e.note ? `<div class="eb-note">💡 ${escapeHtml(e.note)}</div>` : '';
  const known = e.known ? '<span class="badge badge-ok">已掌握</span>' : '';
  return `<div class="card eb-card">
    <div class="eb-head">${badge} ${known} <span class="muted" style="margin-left:auto">${escapeHtml(e.date||'')}</span></div>
    ${main} ${note}
    <div class="eb-actions"><button class="btn btn-sm" data-edit="${e.id}">编辑</button><button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button></div>
  </div>`;
}

function renderStats(){
  const qs = DATA.errorbook.filter(e => e.kind === 'question');
  const card = $('#statsCard');
  if(qs.length === 0){ card.hidden = true; return; }
  card.hidden = false;
  const byTrap = {};
  qs.forEach(e => { byTrap[e.trap] = (byTrap[e.trap]||0) + 1; });
  const max = Math.max.apply(null, Object.values(byTrap));
  const order = ['目的vs手段','原词重现','比较级NG','FALSE_NG混淆','定位丢失','拼写','其他'];
  const rows = order.filter(t => byTrap[t]).map(t => {
    const n = byTrap[t]; const pct = Math.round(n / max * 100);
    return `<div class="stat-row"><span class="stat-label">${escapeHtml(t)}</span><div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div><span class="stat-num">${n}</span></div>`;
  }).join('');
  $('#statsBox').innerHTML = rows || '<div class="muted">暂无陷阱统计</div>';
}

function startReview(){
  const queue = DATA.errorbook.filter(e => !e.known);
  if(queue.length === 0){ toast('没有待复习的记录（都掌握啦）'); return; }
  rev = { queue, idx: 0 };
  $('#reviewCard').hidden = false;
  $('#reviewCard').scrollIntoView();
  showRevCard();
}
function showRevCard(){
  const { queue, idx } = rev;
  if(idx >= queue.length){
    $('#reviewBox').innerHTML = '<div class="q-word">🎉 本轮复习完成</div><div class="q-cn">记得去「模考记录」检验成果。</div>';
    return;
  }
  const e = queue[idx];
  const front = e.kind === 'word' ? escapeHtml(e.en) : escapeHtml(e.stem);
  $('#reviewBox').innerHTML = `
    <div class="q-word">${front}</div>
    <div id="revAns" class="q-cn" hidden></div>
    <div class="form-row" style="margin-top:12px">
      <button class="btn" id="revShow">显示答案</button>
      <button class="btn btn-primary" id="revKnown" hidden>我掌握了 ✅</button>
      <button class="btn btn-danger" id="revSkip" hidden>还没会 ❌</button>
    </div>`;
  $('#revShow').addEventListener('click', () => {
    const ans = e.kind === 'word'
      ? escapeHtml(e.cn || '')
      : `定位：${escapeHtml(e.locate||'—')}<br>原文：${escapeHtml(e.original||'—')}<br>错：${escapeHtml(e.wrong||'—')} → 正：${escapeHtml(e.right||'—')}<br>陷阱：${escapeHtml(e.trap||'—')}`;
    $('#revAns').innerHTML = ans; $('#revAns').hidden = false;
    $('#revShow').hidden = true; $('#revKnown').hidden = false; $('#revSkip').hidden = false;
  });
  $('#revKnown').addEventListener('click', () => { e.known = true; hubSave(); rev.idx++; showRevCard(); });
  $('#revSkip').addEventListener('click', () => { rev.idx++; showRevCard(); });
}
function exitReview(){ $('#reviewCard').hidden = true; }
