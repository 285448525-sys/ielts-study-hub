let curCat = null;
let curId = null;

ready(() => {
  renderCats();
  $('#backBtn').addEventListener('click', () => { $('#detailCard').hidden = true; $('#listCard').hidden = false; });
  $('#addBtn').addEventListener('click', () => { $('#addCard').hidden = false; $('#listCard').hidden = true; $('#detailCard').hidden = true; });
  $('#a_cancel').addEventListener('click', () => { $('#addCard').hidden = true; $('#listCard').hidden = false; });
  $('#a_save').addEventListener('click', addTpl);
  $('#delBtn').addEventListener('click', delTpl);
});

function renderCats(){
  const cats = [];
  DATA.writing.forEach(t => { if(!cats.includes(t.category)) cats.push(t.category); });
  const nav = $('#catNav');
  if(cats.length === 0){ nav.innerHTML = '<div class="muted">暂无分类</div>'; $('#tplList').innerHTML=''; return; }
  if(!curCat) curCat = cats[0];
  nav.innerHTML = cats.map(c => `<button class="btn ${c===curCat?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  nav.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { curCat = b.dataset.cat; renderCats(); renderList(); }));
  renderList();
}

function renderList(){
  const list = DATA.writing.filter(t => t.category === curCat);
  $('#tplList').innerHTML = list.map(t => `<div class="card tpl-card" data-id="${t.id}"><b>${escapeHtml(t.title)}</b><div class="muted" style="font-size:13px;margin-top:4px">${escapeHtml(t.category)}</div></div>`).join('');
  $('#empty').hidden = list.length > 0;
  $('#tplList').querySelectorAll('[data-id]').forEach(c => c.addEventListener('click', () => openTpl(c.dataset.id)));
}

function openTpl(id){
  const t = DATA.writing.find(x => x.id === id);
  if(!t) return;
  curId = id;
  $('#listCard').hidden = true; $('#detailCard').hidden = false;
  $('#dTitle').textContent = t.title;
  $('#skeleton').innerHTML = highlight(t.skeleton);
  $('#tips').innerHTML = t.tips ? '💡 ' + escapeHtml(t.tips).replace(/\n/g,'<br>') : '';
  buildPractice(t.skeleton);
}

function highlight(s){ return escapeHtml(s).replace(/【(.+?)】/g, '【<span class="ph">$1</span>】'); }

function buildPractice(skeleton){
  const parts = skeleton.split(/(【[^】]*】)/g);
  let html = '';
  parts.forEach(p => {
    const m = p.match(/^【(.+?)】$/);
    if(m){ const w = Math.max(80, m[1].length * 13); html += `<input class="ph-input" data-ph="${escapeHtml(m[1])}" placeholder="${escapeHtml(m[1])}" style="width:${w}px">`; }
    else { html += escapeHtml(p); }
  });
  const box = $('#practice');
  box.innerHTML = html;
  box.querySelectorAll('.ph-input').forEach(inp => inp.addEventListener('input', updatePreview));
  updatePreview();
}

function updatePreview(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return;
  let out = t.skeleton;
  document.querySelectorAll('.ph-input').forEach(inp => {
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    out = out.split('【' + ph + '】').join(val ? escapeHtml(val) : '【' + ph + '】');
  });
  $('#preview').innerHTML = out.replace(/\n/g, '<br>');
}

function addTpl(){
  const cat = $('#a_cat').value;
  const title = $('#a_title').value.trim();
  const skeleton = $('#a_skeleton').value.trim();
  if(!title || !skeleton){ toast('请填标题和骨架'); return; }
  DATA.writing.push({ id: uid(), category: cat, title, skeleton, tips: $('#a_tips').value.trim() });
  hubSave();
  curCat = cat;
  $('#addCard').hidden = true; $('#listCard').hidden = false;
  renderCats(); renderList();
  toast('已添加模板');
}

function delTpl(){
  if(!curId) return;
  if(!confirm('确定删除这个模板？')) return;
  DATA.writing = DATA.writing.filter(x => x.id !== curId);
  hubSave();
  $('#detailCard').hidden = true; $('#listCard').hidden = false;
  curId = null;
  renderCats(); renderList();
  toast('已删除');
}
