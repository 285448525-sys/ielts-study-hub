ready(() => {
  const s = DATA.settings;
  $('#sName').value = s.name || '';
  $('#sExam').value = s.examDate || '';
  $('#sGoal').value = s.dailyGoalHours || '';
  $('#sTheme').value = s.theme || 'light';

  const t = s.targets || {};
  $('#tOverall').value = t.overall || '';
  $('#tListening').value = t.listening || '';
  $('#tReading').value = t.reading || '';
  $('#tWriting').value = t.writing || '';
  $('#tSpeaking').value = t.speaking || '';

  $('#sPron').value = (s.pronunciationScore != null ? s.pronunciationScore : '');

  $('#sRelayToken').value = s.relayToken || '';

  $('#sChime').checked = DATA.settings.chimeOnDone !== false;

  $('#sSyncCode').value = s.syncCode || '';
  renderSyncState();

  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveRelay').addEventListener('click', saveRelay);
  $('#testAiBtn').addEventListener('click', testAIConnection);
  $('#toggleKey').addEventListener('click', () => {
    const el = $('#sRelayToken');
    if(!el) return;
    const showing = el.type === 'text';
    el.type = showing ? 'password' : 'text';
    $('#toggleKey').textContent = showing ? '显示' : '隐藏';
  });
  $('#sTheme').addEventListener('change', () => applyTheme($('#sTheme').value));
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  $('#resetBtn').addEventListener('click', resetData);

  // 云端同步（手机号账号，单按钮：注册 / 登录统一入口）
  $('#syncBindBtn').addEventListener('click', () => { syncLoginOrRegister(); });
  $('#sSyncCode').addEventListener('keydown', e => { if(e.key === 'Enter') syncLoginOrRegister(); });
  $('#syncDiagBtn').addEventListener('click', () => { syncDiagnose(); });
  $('#syncNowBtn').addEventListener('click', () => { cloudUpload(true, true); });
});

function saveSettings(){
  DATA.settings.name = $('#sName').value.trim();
  DATA.settings.examDate = $('#sExam').value;
  DATA.settings.dailyGoalHours = parseFloat($('#sGoal').value) || 0;
  DATA.settings.theme = $('#sTheme').value;
  DATA.settings.targets = {
    overall: parseFloat($('#tOverall').value) || 0,
    listening: parseFloat($('#tListening').value) || 0,
    reading: parseFloat($('#tReading').value) || 0,
    writing: parseFloat($('#tWriting').value) || 0,
    speaking: parseFloat($('#tSpeaking').value) || 0,
  };
  DATA.settings.syncCode = $('#sSyncCode').value.replace(/\D/g, '');
  DATA.settings.autoSync = true; // 默认开启自动同步，与考研站一致（绑定后由 syncLoginOrRegister 控制）
  DATA.settings.pronunciationScore = ($('#sPron').value === '' ? null : (parseFloat($('#sPron').value) || null)); // 口语模考固定发音分（0–9），空=未设置
  DATA.settings.chimeOnDone = $('#sChime').checked;
  // 记录本机保存时间：name/examDate/dailyGoalHours/theme/targets/syncCode/autoSync/pronunciationScore/chimeOnDone
  const now = Date.now();
  DATA.settings._fieldTs = DATA.settings._fieldTs || {};
  ['name','examDate','dailyGoalHours','theme','targets','syncCode','autoSync','pronunciationScore','chimeOnDone'].forEach(f => { DATA.settings._fieldTs[f] = now; });
  hubSave(); applyTheme();
  if(DATA.settings.syncCode) scheduleCloudUpload();   // 已登录则立即同步（含发音分等）到云端
  toast('设置已保存（已同步云端）');
}

function saveRelay(){
  DATA.settings.relayToken = $('#sRelayToken').value.trim();
  DATA.settings._fieldTs = DATA.settings._fieldTs || {};
  DATA.settings._fieldTs.relayToken = Date.now();   // 记录本机 Key 保存时间，合并时按时间胜出，避免被云端旧值覆盖
  hubSave();
  if(DATA.settings.syncCode) scheduleCloudUpload();   // 已登录则立即同步到云端，避免 60s 延迟期间清缓存丢 Key
  toast(DATA.settings.relayToken ? '已保存 AI 接口配置（已同步云端）' : '已清空 Key');
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
    // 智能合并导入（v20260823w）：只把「本地没有的内容」补进来，本地已有的（更新/更多）绝不覆盖。
    //   - 数组字段：备份中本地不存在的元素才追加（有 id 的按 id 去重，无 id 的按序列化去重）
    //   - settings：本地已非空的值优先，备份只补本地为空的字段
    //   - 其他顶层字段：本地有则用本地，本地无才取备份
    //   - 口语 speaking：走 mergeSpeakingKeepAnswers（官方题基准 + 回填答案，不新增非官方题）
    const ARRAY_FIELDS = ['sessions','notes','meds','words','plans','corpus','scores','errorbook',
      'energy','checkins','writing','writingScores','speakingStories','mockRecords','longSent','dictationSources','dictationLogs'];
    const result = {};
    // 1) 顶层标量/对象字段：本地优先，本地无才取备份
    for(const k of Object.keys(DATA)){
      if(ARRAY_FIELDS.includes(k)) continue;          // 数组单独处理
      if(k === 'settings') continue;                  // settings 单独处理
      result[k] = (DATA[k] !== undefined && DATA[k] !== null && !(Array.isArray(DATA[k]) && DATA[k].length === 0))
        ? DATA[k] : (obj[k] !== undefined ? obj[k] : DATA[k]);
    }
    // 2) 数组字段：本地为基准，补入备份中本地没有的元素
    for(const f of ARRAY_FIELDS){
      const localArr = Array.isArray(DATA[f]) ? DATA[f] : [];
      const bakArr = Array.isArray(obj[f]) ? obj[f] : [];
      const merged = localArr.slice();
      if(bakArr.length){
        // 去重键：有 id 字段用 id，否则用序列化
        const seen = new Set(localArr.map(it => (it && it.id != null) ? String(it.id) : JSON.stringify(it)));
        for(const it of bakArr){
          const key = (it && it.id != null) ? String(it.id) : JSON.stringify(it);
          if(!seen.has(key)){ merged.push(it); seen.add(key); }
        }
      }
      result[f] = merged;
    }
    // 3) settings：本地已非空优先，备份只补缺
    result.settings = Object.assign({}, obj.settings || {}, DATA.settings || {});
    DATA = result;
    // 4) 口语：官方题基准 + 回填答案（本地 + 备份双向），不新增非官方题
    if(typeof mergeSpeakingKeepAnswers === 'function'){
      DATA.speaking = mergeSpeakingKeepAnswers(DATA.speaking);
      DATA.speakingVersion = SPEAKING_BANK_VERSION;
    }
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
