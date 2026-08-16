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
  $('#sRelayUrl').value = s.relayUrl || '';

  $('#sVisionToken').value = s.visionToken || '';
  $('#sVisionUrl').value = s.visionBase || '';
  $('#sVisionModel').value = s.visionModel || '';

  $('#sSyncCode').value = s.syncCode || '';
  renderSyncState();

  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveRelay').addEventListener('click', saveRelay);
  $('#testAiBtn').addEventListener('click', testAIConnection);
  $('#saveVision').addEventListener('click', saveVision);
  $('#testVisionBtn').addEventListener('click', testVisionConnection);
  $('#sTheme').addEventListener('change', () => applyTheme($('#sTheme').value));
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  $('#resetBtn').addEventListener('click', resetData);

  // 云端同步（手机号账号，单按钮：注册 / 登录统一入口）
  $('#syncBindBtn').addEventListener('click', () => { syncLoginOrRegister(); });
  $('#sSyncCode').addEventListener('keydown', e => { if(e.key === 'Enter') syncLoginOrRegister(); });

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
  hubSave(); applyTheme(); toast('设置已保存');
}

function saveRelay(){
  DATA.settings.relayToken = $('#sRelayToken').value.trim();
  DATA.settings.relayUrl = $('#sRelayUrl').value.trim();
  hubSave();
  toast(DATA.settings.relayToken ? '已保存 AI 接口配置' : '已清空 Key');
}

/* 视觉模型（截图识别）配置 */
function saveVision(){
  DATA.settings.visionToken = $('#sVisionToken').value.trim();
  DATA.settings.visionBase = $('#sVisionUrl').value.trim();
  DATA.settings.visionModel = $('#sVisionModel').value.trim();
  hubSave();
  toast(DATA.settings.visionToken ? '已保存视觉模型配置' : '已清空视觉 Key');
}

/* 测试连接：用输入框里的视觉 Key 探活 Qwen-VL，成功即自动保存。
   视觉模型必须带图，故用 1x1 像素图 + 文本探活验证 Key / 接口可达。 */
var TEST_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
async function testVisionConnection(){
  const key = $('#sVisionToken').value.trim();
  if(!key){ toast('请先填写视觉模型 Key'); return; }
  const btn = $('#testVisionBtn');
  if(btn) btn.disabled = true;
  setVisionStatus('正在测试连接…', '');
  try{
    DATA.settings.visionToken = key; // 临时用输入框的 key 探活
    DATA.settings.visionBase = $('#sVisionUrl').value.trim();
    DATA.settings.visionModel = $('#sVisionModel').value.trim();
    const content = [
      { type:'image_url', image_url:{ url: TEST_PIXEL } },
      { type:'text', text:'Reply with exactly the single word: PONG' }
    ];
    const r = await callVisionRelay('errorbook_capture', [{ role:'user', content }], 0.1);
    hubSave(); // 探活成功 → 直接生效并保存
    setVisionStatus('✅ 连接成功：' + (r||'').slice(0,60), 'ok');
    toast('✅ 连接成功，Key 已保存');
  }catch(e){
    setVisionStatus('❌ 连接失败：' + e.message, 'error');
    toast('❌ 连接失败：' + e.message);
  }finally{
    if(btn) btn.disabled = false;
  }
}
function setVisionStatus(msg, kind){
  const el = $('#visionStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'muted' + (kind ? ' sync-status-' + kind : '');
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
    // Bug14：校验根对象，缺失数组字段用默认值补齐，避免导入后字段丢失/崩溃
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)){ toast('文件格式错误（根必须是对象）'); return; }
    const def = { sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[],
      errorbook:[], energy:[], checkins:[], speaking:[], speakingStories:[],
      writing:[], writingScores:[], mockRecords:[] };
    const merged = Object.assign({}, def, obj);   // 用新对象，保留 def 纯净，后续兜底才能用回默认空数组
    for(const f of ['sessions','notes','meds','words','plans','corpus','scores','errorbook',
      'energy','checkins','speaking','writing','writingScores','speakingStories','mockRecords']){
      if(!Array.isArray(merged[f])) merged[f] = def[f];
    }
    merged.settings = Object.assign({}, DATA.settings || {}, obj.settings || {});
    DATA = merged;
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
    // Bug13：初始化全部顶层数组，避免清空后字段丢失导致页面报错
    DATA = {
      sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[],
      errorbook:[], energy:[], checkins:[], speaking:[], speakingStories:[],
      writing:[], writingScores:[], mockRecords:[],
      settings: DATA.settings
    };
    hubSave(); toast('已清空数据'); setTimeout(() => location.reload(), 600);
  }
}

