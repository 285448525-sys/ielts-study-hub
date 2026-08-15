ready(() => {
  const s = DATA.settings;
  $('#sName').value = s.name || '';
  $('#sExam').value = s.examDate || '';
  $('#sGoal').value = s.dailyGoalHours || 8;
  $('#sTheme').value = s.theme || 'light';

  const t = s.targets || {};
  $('#tOverall').value = t.overall || 6.0;
  $('#tListening').value = t.listening || 5.5;
  $('#tReading').value = t.reading || 6.5;
  $('#tWriting').value = t.writing || 5.5;
  $('#tSpeaking').value = t.speaking || 5.5;

  $('#sRelayToken').value = s.relayToken || '';

  $('#sSyncCode').value = s.syncCode || '';
  $('#sNotify').checked = !!s.notifyEnabled;
  renderSyncState();

  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveRelay').addEventListener('click', saveRelay);
  $('#testAiBtn').addEventListener('click', testAIConnection);
  $('#sTheme').addEventListener('change', () => applyTheme($('#sTheme').value));
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  $('#resetBtn').addEventListener('click', resetData);

  // 云端同步（手机号账号，单按钮：注册 / 登录统一入口）
  $('#syncBindBtn').addEventListener('click', () => { syncLoginOrRegister(); });
  $('#sSyncCode').addEventListener('keydown', e => { if(e.key === 'Enter') syncLoginOrRegister(); });
  $('#sNotify').addEventListener('change', () => {
    DATA.settings.notifyEnabled = $('#sNotify').checked; hubSave();
    if(DATA.settings.notifyEnabled) requestNotify();
  });

  renderLinks();

  $('#addLinkBtn').addEventListener('click', () => {
    const name = $('#lkName').value.trim();
    const url = $('#lkUrl').value.trim();
    const note = $('#lkNote').value.trim();
    const badge = $('#lkBadge').value;
    if(!name){ toast('请填名称'); return; }
    DATA.settings.links = DATA.settings.links || [];
    DATA.settings.links.push({
      id: uid(),
      name,
      url: badge === '本地' ? '' : url,
      note,
      badge
    });
    hubSave();
    $('#lkName').value = ''; $('#lkUrl').value = ''; $('#lkNote').value = '';
    renderLinks();
    toast('已添加常用网址');
  });
});

function saveSettings(){
  DATA.settings.name = $('#sName').value.trim() || 'Camille';
  DATA.settings.examDate = $('#sExam').value;
  DATA.settings.dailyGoalHours = parseFloat($('#sGoal').value) || 8;
  DATA.settings.theme = $('#sTheme').value;
  DATA.settings.targets = {
    overall: parseFloat($('#tOverall').value) || 6.0,
    listening: parseFloat($('#tListening').value) || 5.5,
    reading: parseFloat($('#tReading').value) || 6.5,
    writing: parseFloat($('#tWriting').value) || 5.5,
    speaking: parseFloat($('#tSpeaking').value) || 5.5,
  };
  DATA.settings.syncCode = $('#sSyncCode').value.replace(/\D/g, '');
  DATA.settings.autoSync = true; // 默认开启自动同步，与考研站一致（绑定后由 syncLoginOrRegister 控制）
  DATA.settings.notifyEnabled = $('#sNotify').checked;
  hubSave(); applyTheme(); toast('设置已保存');
  if(DATA.settings.notifyEnabled) requestNotify();
}

function saveRelay(){
  DATA.settings.relayToken = $('#sRelayToken').value.trim();
  hubSave();
  toast(DATA.settings.relayToken ? '已保存 DeepSeek Key' : '已清空 Key');
}

/* 测试连接：用输入框里的 Key 探活 DeepSeek，成功即自动保存 */
async function testAIConnection(){
  const key = $('#sRelayToken').value.trim();
  if(!key){ toast('请先填写 API Key'); return; }
  const btn = $('#testAiBtn');
  if(btn) btn.disabled = true;
  setAiStatus('正在测试连接…', '');
  try{
    const prev = DATA.settings.relayToken;
    DATA.settings.relayToken = key; // 临时用输入框的 key 探活
    const r = await callRelay('gpt', [{ role:'user', content:'Reply with exactly the single word: PONG' }], 0.1);
    DATA.settings.relayToken = key; // 探活成功 → 直接生效并保存
    hubSave();
    setAiStatus('✅ 连接成功：' + (r||'').slice(0,60), 'ok');
    toast('✅ 连接成功，Key 已保存');
  }catch(e){
    setAiStatus('❌ 连接失败：' + e.message, 'error');
    toast('❌ 连接失败：' + e.message);
  }finally{
    if(btn) btn.disabled = false;
  }
}
function setAiStatus(msg, kind){
  const el = $('#aiStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'muted' + (kind ? ' sync-status-' + kind : '');
}
function exportData(){
  const blob = new Blob([JSON.stringify(DATA, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ielts_hub_backup_' + todayKey() + '.json';
  a.click();
  toast('已导出备份');
}

function importData(file){
  const r = new FileReader();
  r.onload = () => { try{
    const obj = JSON.parse(r.result);
    DATA = Object.assign({sessions:[],notes:[],meds:[],words:[],plans:[],corpus:[],scores:[],errorbook:[],energy:[],settings:{}}, obj);
    hubSave(); location.reload();
  }catch(e){ toast('文件格式错误'); } };
  r.readAsText(file);
}

function renderLinks(){
  const links = DATA.settings.links || [];
  const box = $('#linksList');
  if(links.length === 0){
    box.innerHTML = '<p class="muted">还没有常用网址。</p>' +
      '<button class="btn btn-primary" id="restoreLinksBtn2" style="margin-top:8px">↺ 一键恢复默认常用网址</button>';
    const rb = $('#restoreLinksBtn2');
    if(rb) rb.addEventListener('click', () => { if(typeof restoreDefaultLinks === 'function') restoreDefaultLinks(); });
    return;
  }
  box.innerHTML = links.map((l, i) =>
    '<div class="link-edit-row">' +
      '<input value="' + escapeHtml(l.name) + '" data-lk-name="' + i + '" placeholder="名称" />' +
      '<input value="' + escapeHtml(l.url || '') + '" data-lk-url="' + i + '" placeholder="网址" />' +
      '<input value="' + escapeHtml(l.note || '') + '" data-lk-note="' + i + '" placeholder="备注" />' +
      '<select data-lk-badge="' + i + '">' +
        '<option value="打开"' + (l.badge === '本地' ? '' : ' selected') + '>网页链接</option>' +
        '<option value="本地"' + (l.badge === '本地' ? ' selected' : '') + '>本地软件</option>' +
      '</select>' +
      '<button class="btn btn-sm" data-lk-del="' + i + '">删除</button>' +
    '</div>'
  ).join('');
  box.querySelectorAll('input,select').forEach(el => {
    el.addEventListener('change', () => {
      const i = Number(el.dataset.lkName || el.dataset.lkUrl || el.dataset.lkNote || el.dataset.lkBadge);
      const links = DATA.settings.links;
      if(!links[i]) return;
      if(el.dataset.lkName != null) links[i].name = el.value;
      if(el.dataset.lkUrl != null) links[i].url = el.value;
      if(el.dataset.lkNote != null) links[i].note = el.value;
      if(el.dataset.lkBadge != null) links[i].badge = el.value;
      hubSave();
      // also update dashboard if it's open
      if($('#favLinks')) renderFavLinks();
    });
  });
  box.querySelectorAll('button[data-lk-del]').forEach(b => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.lkDel);
      DATA.settings.links.splice(i, 1);
      hubSave();
      renderLinks();
      if($('#favLinks')) renderFavLinks();
    });
  });
}

function resetData(){
  if(confirm('⚠️ 确定清空所有数据？此操作不可恢复，请先导出备份。')){
    DATA = { sessions:[], notes:[], meds:[], words:[], settings: DATA.settings };
    hubSave(); toast('已清空数据'); setTimeout(() => location.reload(), 600);
  }
}

