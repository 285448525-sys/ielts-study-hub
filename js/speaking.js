let curType = 'P1';
let curOpenId = null;
const PF_LABEL = { '没练':0, '练过':1, '脱口而出':2 };

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
    curType = b.dataset.type; curOpenId = null; renderTabs(); renderGroups();
  }));
  $('#addBtn').addEventListener('click', () => { $('#addArea').hidden = false; $('#a_framework').value = curType === 'P2' ? 'P2人物母本' : 'P1框架'; });
  $('#a_cancel').addEventListener('click', () => { $('#addArea').hidden = true; });
  $('#a_save').addEventListener('click', addEntry);
  renderTabs(); renderGroups();
});

function renderTabs(){
  $('#tabs').querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === curType));
}

function renderGroups(){
  const list = DATA.speaking.filter(s => s.type === curType);
  if(list.length === 0){ $('#groups').innerHTML = ''; $('#empty').hidden = false; return; }
  $('#empty').hidden = true;
  const frameworks = [];
  list.forEach(s => { if(!frameworks.includes(s.framework)) frameworks.push(s.framework); });
  $('#groups').innerHTML = frameworks.map(fw => {
    const items = list.filter(s => s.framework === fw);
    return `<div class="sp-group"><h3>${escapeHtml(fw)}</h3>${items.map(cardHtml).join('')}</div>`;
  }).join('');
  $('#groups').querySelectorAll('[data-card]').forEach(c => c.addEventListener('click', ev => {
    if(ev.target.closest('button') || ev.target.closest('textarea') || ev.target.closest('input')) return;
    curOpenId = curOpenId === c.dataset.card ? null : c.dataset.card;
    renderGroups();
  }));
  if(curOpenId) bindOpen(curOpenId);
}

function bindOpen(id){
  const s = DATA.speaking.find(x => x.id === id); if(!s) return;
  $('#groups').querySelectorAll(`[data-pf]`).forEach(b => b.addEventListener('click', () => { s.proficiency = b.dataset.pf; hubSave(); renderGroups(); }));
  $('#groups').querySelector(`[data-save="${id}"]`).addEventListener('click', () => {
    s.content = $(`#c_content_${id}`).value;
    s.keywords = $(`#c_keywords_${id}`).value;
    s.cue = $(`#c_cue_${id}`).value;
    s.linkedTo = $(`#c_linked_${id}`).value;
    hubSave(); toast('已保存');
  });
  $('#groups').querySelector(`[data-del="${id}"]`).addEventListener('click', () => {
    if(!confirm('确定删除这条素材？')) return;
    DATA.speaking = DATA.speaking.filter(x => x.id !== id);
    hubSave(); curOpenId = null; renderGroups(); toast('已删除');
  });
}

function cardHtml(s){
  const pfIdx = PF_LABEL[s.proficiency] != null ? PF_LABEL[s.proficiency] : 0;
  const badge = `<span class="badge pf-${pfIdx}">${escapeHtml(s.proficiency||'没练')}</span>`;
  if(curOpenId !== s.id){
    return `<div class="sp-card" data-card="${s.id}"><span class="sp-title">${escapeHtml(s.title)}</span> ${badge}</div>`;
  }
  const id = s.id;
  return `<div class="sp-card" data-card="${id}">
    <div class="sp-title">${escapeHtml(s.title)} ${badge}</div>
    <div class="sp-field"><label>完整版素材</label><textarea id="c_content_${id}">${escapeHtml(s.content||'')}</textarea></div>
    <div class="sp-field"><label>关键词</label><input id="c_keywords_${id}" value="${escapeHtml(s.keywords||'')}"/></div>
    <div class="sp-field"><label>复述线 / 提纲</label><textarea id="c_cue_${id}">${escapeHtml(s.cue||'')}</textarea></div>
    <div class="sp-field"><label>串题关系</label><input id="c_linked_${id}" value="${escapeHtml(s.linkedTo||'')}"/></div>
    <div class="pf-btns">
      <button class="btn btn-sm" data-pf="没练">没练</button>
      <button class="btn btn-sm" data-pf="练过">练过</button>
      <button class="btn btn-sm" data-pf="脱口而出">脱口而出</button>
    </div>
    <div class="sp-actions">
      <button class="btn btn-primary btn-sm" data-save="${id}">保存</button>
      <button class="btn btn-danger btn-sm" data-del="${id}">删除</button>
    </div>
  </div>`;
}

function addEntry(){
  const title = $('#a_title').value.trim();
  if(!title){ toast('请填标题'); return; }
  DATA.speaking.push({
    id: uid(), type: curType,
    framework: $('#a_framework').value.trim() || (curType==='P2' ? 'P2人物母本' : 'P1框架'),
    title, content: $('#a_content').value,
    keywords: $('#a_keywords').value, cue: $('#a_cue').value, linkedTo: $('#a_linked').value,
    proficiency: '没练'
  });
  hubSave(); $('#addArea').hidden = true;
  $('#a_title').value=''; $('#a_content').value=''; $('#a_keywords').value=''; $('#a_cue').value=''; $('#a_linked').value='';
  renderGroups(); toast('已添加素材');
}
