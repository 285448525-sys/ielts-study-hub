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

  $('#sPron').value = (s.pronunciationScore != null ? s.pronunciationScore : '');

  $('#sRelayToken').value = s.relayToken || '';

  $('#sChime').checked = DATA.settings.chimeOnDone !== false;

  $('#sSyncCode').value = s.syncCode || '';
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
  $('#syncDiagBtn').addEventListener('click', () => { syncDiagnose(); });
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
  DATA.settings.pronunciationScore = ($('#sPron').value === '' ? null : (parseFloat($('#sPron').value) || null)); // 口语模考固定发音分（0–9），空=未设置
  DATA.settings.chimeOnDone = $('#sChime').checked;
  hubSave(); applyTheme(); toast('设置已保存');
}

function saveRelay(){
  DATA.settings.relayToken = $('#sRelayToken').value.trim();
  hubSave();
  toast(DATA.settings.relayToken ? '已保存 AI 接口配置' : '已清空 Key');
}

/* 讯飞语音配置已移除（录音 / 转写功能已下线，发音分改由设置里的固定分提供） */


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
