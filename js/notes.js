ready(() => {
  $('#saveNote').addEventListener('click', saveNote);
  $('#searchNote').addEventListener('input', renderNotes);
  renderNotes();
});

function saveNote(){
  const tags = $('#noteTags').value.trim();
  const content = $('#noteContent').value.trim();
  if(!content){ toast('写点内容再保存'); return; }
  DATA.notes.push({ id: uid(), date: todayKey(), ts: Date.now(), tags, content });
  hubSave();
  $('#noteContent').value = ''; $('#noteTags').value = '';
  renderNotes(); toast('已保存心得');
}

function deleteNote(id){
  DATA.notes = DATA.notes.filter(n => n.id !== id); hubSave(); renderNotes();
}

function renderNotes(){
  const kw = $('#searchNote').value.trim().toLowerCase();
  let items = DATA.notes.slice().sort((a,b) => b.ts - a.ts);
  if(kw) items = items.filter(n => (n.content+n.tags).toLowerCase().includes(kw));

  const list = $('#noteList');
  if(items.length === 0){ list.innerHTML = renderEmpty('没有匹配的心得。'); return; }
  list.innerHTML = items.map(n => {
    const d = new Date(n.ts);
    return `<div class="list-item" style="align-items:flex-start;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;width:100%;font-size:12px;color:var(--muted)">
        <span><strong>📝 心得</strong>${n.tags ? ' · '+escapeHtml(n.tags) : ''}</span>
        <span>${n.date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}
          <button class="btn btn-sm btn-ghost" data-del="${n.id}" style="margin-left:8px">删</button>
        </span>
      </div>
      <div style="white-space:pre-wrap;width:100%">${escapeHtml(n.content)}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => deleteNote(b.dataset.del)));
}

