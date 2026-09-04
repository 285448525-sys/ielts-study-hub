// 把当前 DATA.settings 回填到设置页表单（登录合并云端数据后调用，确保「目标分数/每日目标」等可见恢复）
function populateSettingsForm(){
  const s = DATA.settings || {};
  if($('#sName')) $('#sName').value = s.name || '';
  if($('#sExam')) $('#sExam').value = s.examDate || '';
  // 考试日期倒计时显示（从回顾页移来）
  const cdEl2 = document.getElementById('settingsCountdown');
  if(cdEl2 && typeof examCountdown === 'function'){
    const cd = examCountdown();
    cdEl2.textContent = cd.hasExam ? ('距考试 ' + cd.label) : '';
    cdEl2.style.background = cd.hasExam ? 'var(--primary-soft)' : 'transparent';
    cdEl2.style.color = cd.hasExam ? 'var(--primary)' : 'var(--muted)';
  }
  if($('#sGoal')) $('#sGoal').value = s.dailyGoalHours || '';
  if($('#sThemeToggle')) $('#sThemeToggle').checked = (s.theme === 'dark');

  const t = s.targets || {};
  if($('#tOverall')) $('#tOverall').value = t.overall || '';
  if($('#tListening')) $('#tListening').value = t.listening || '';
  if($('#tReading')) $('#tReading').value = t.reading || '';
  if($('#tWriting')) $('#tWriting').value = t.writing || '';
  if($('#tSpeaking')) $('#tSpeaking').value = t.speaking || '';

  if($('#sPron')) $('#sPron').value = (s.pronunciationScore != null ? s.pronunciationScore : '');
  if($('#sRelayToken')) $('#sRelayToken').value = s.relayToken || '';
  if($('#sChime')) $('#sChime').checked = s.chimeOnDone !== false;
  if($('#sSyncCode')) $('#sSyncCode').value = s.syncCode || '';
}

ready(() => {
  populateSettingsForm();
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
  $('#sThemeToggle').addEventListener('change', () => {
    const dark = $('#sThemeToggle').checked;
    DATA.settings.theme = dark ? 'dark' : 'light';
    applyTheme();
    hubSave();
    if(DATA.settings.syncCode) scheduleCloudUpload(); // 已登录则同步主题到云端（theme 在 SYNC_SETTINGS_FIELDS）
  });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  $('#resetBtn').addEventListener('click', resetData);

  // 云端同步（手机号账号，单按钮：注册 / 登录统一入口）
  $('#syncBindBtn').addEventListener('click', () => { syncLoginOrRegister(); });
  $('#sSyncCode').addEventListener('keydown', e => { if(e.key === 'Enter') syncLoginOrRegister(); });
  $('#syncDiagBtn').addEventListener('click', () => { syncDiagnose(); });
  $('#syncNowBtn').addEventListener('click', () => { cloudUpload(true, true); });

  // 云端合并完成后回填表单：登录/其他设备同步后，让「目标分数/每日目标」等立即可见。
  // 若用户正在表单里输入（焦点在某设置输入框），则不覆盖，避免打断输入。
  document.addEventListener('hub:data-merged', () => {
    const a = document.activeElement;
    if(a && a.tagName === 'INPUT' && /^[ts]/.test(a.id || '')) return;
    populateSettingsForm();
  });
});

function saveSettings(){
  DATA.settings.name = $('#sName').value.trim();
  DATA.settings.examDate = $('#sExam').value;
  // 一律清空历史多场日程数组：examDate 是唯一有效来源。旧逻辑仅在有值时清，
  // 会漏掉「用户清空日期」——残留的 examDates 会让 nextExamDate() 回退显示已废弃的旧档期（倒计时复活）
  DATA.settings.examDates = [];
  DATA.settings.dailyGoalHours = parseFloat($('#sGoal').value) || 0;
  DATA.settings.theme = $('#sThemeToggle').checked ? 'dark' : 'light';
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
  // 刷新考试倒计时显示（重新查元素：cdEl2 是 populateSettingsForm 的局部变量，此处不可跨函数访问）
  const cdEl2 = document.getElementById('settingsCountdown');
  if(cdEl2 && typeof examCountdown === 'function'){
    const cd2 = examCountdown();
    cdEl2.textContent = cd2.hasExam ? ('距考试 ' + cd2.label) : '';
    cdEl2.style.background = cd2.hasExam ? 'var(--primary-soft)' : 'transparent';
    cdEl2.style.color = cd2.hasExam ? 'var(--primary)' : 'var(--muted)';
  }
  if(DATA.settings.syncCode) scheduleCloudUpload();   // 已登录则立即同步（含发音分等）到云端
  toast(DATA.settings.syncCode ? '设置已保存（已同步云端）' : '设置已保存');   // 未登录不谎报「已同步」
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
  setAiLoading();
  const prev = DATA.settings.relayToken || '';
  try{
    DATA.settings.relayToken = key; // 临时用输入框的 key 探活（callRelay 从 settings 里读）
    const r = await callRelay('gpt', [{ role:'user', content:'Reply with exactly the single word: PONG' }], 0.1);
    DATA.settings.relayToken = key; // 探活成功 → 直接生效并保存（与 saveRelay 一致：记时间戳 + 调度云端同步）
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs.relayToken = Date.now();
    hubSave();
    if(DATA.settings.syncCode) scheduleCloudUpload();
    setAiStatus('✅ 连接成功：' + (r||'').slice(0,60), 'ok');
    toast('✅ 连接成功，Key 已保存');
  }catch(e){
    DATA.settings.relayToken = prev;   // 探活失败 → 恢复原 Key：否则无效 key 残留内存态，后续任何 hubSave 都会把它持久化
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
// 测试连接等待时，用弹跳 loader（.ui-loader）代替纯文字
function setAiLoading(){
  const el = $('#aiStatus');
  if(!el) return;
  el.className = 'muted';
  el.innerHTML = '<div style="height:40px;overflow:hidden;display:flex;justify-content:center;align-items:flex-start">'
    + '<div class="ui-loader" style="transform:scale(.6);transform-origin:top center;margin-top:2px">'
    + '<div class="ui-loader-dot"></div><div class="ui-loader-dot m2"></div><div class="ui-loader-dot m3"></div>'
    + '<div class="ui-loader-shadow"></div><div class="ui-loader-shadow m2"></div><div class="ui-loader-shadow m3"></div>'
    + '</div></div>';
}
function exportData(){
  const blob = new Blob([JSON.stringify(DATA, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ielts_hub_backup_' + todayKey() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);   // 下载启动后回收 blob URL
  toast('已导出备份');
}

function importData(file){
  const r = new FileReader();
  r.onload = () => { try{
    const obj = JSON.parse(r.result);
    // Bug14：校验根对象，缺失数组字段用默认值补齐，避免导入后字段丢失/崩溃
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)){ toast('文件格式错误（根必须是对象）'); return; }
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
  }catch(e){
    const box = document.getElementById('importErr');
    if(box) box.innerHTML = '<div class="ui-err-card">'
      + '<span class="ui-err-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.3v.2"/></svg></span>'
      + '<div class="ui-err-body"><h4 class="ui-err-title">导入失败</h4><ul class="ui-err-list"><li>文件不是有效的 JSON 备份</li><li>请确认是从本站点「导出 JSON」得到的文件</li></ul></div>'
      + '<button class="ui-err-close" type="button" aria-label="关闭" onclick="this.closest(\'.ui-err-box\').innerHTML=\'\'">×</button>'
      + '</div>';
    toast('文件格式错误');
  } };
  r.readAsText(file);
}

function resetData(){
  if(confirm('⚠️ 确定清空所有数据？此操作不可恢复，请先导出备份。')){
    // Bug13：初始化全部顶层数组，避免清空后字段丢失导致页面报错
    const settings = DATA.settings;
    DATA = {
      sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[],
      errorbook:[], energy:[], checkins:[], speaking:[], speakingStories:[],
      writing:[], writingScores:[], mockRecords:[],
      settings,
      // 墓碑必须保留：① data.js 写作模板迁移靠 deletedIds 识别「用户手动删过的模板」，丢了会把已删模板全部复活；
      // ② 多设备合并时靠墓碑过滤已删内容
      deletedIds: DATA.deletedIds || [],
      deletedWrongKeys: DATA.deletedWrongKeys || []
    };
    clearActive();   // 清计时恢复锚点：sessions 已空，timer.js 的「已结算」防护拦不住，会按本地锚点把旧计时复活
    hubSave();
    toast('已清空数据');
    // 已登录：必须抢在 30s 自动 cloudDownload 轮询之前，把「空数据+墓碑」强制推上云端（不等 60s 防抖），
    // 否则本机清空后云端仍是旧数据，下次拉取会被整份合并回来——清空等于白清。
    const reload = () => setTimeout(() => location.reload(), 500);
    if(settings.syncCode && typeof cloudUpload === 'function'){
      Promise.resolve(cloudUpload(false, true)).then(ok => {
        if(ok === false){
          // 上传失败（断网等）：本地已清但云端仍是旧数据。记补传标记，下次启动 initCloudSync 强制补传，
          // 避免云端旧数据抢先合并回来复活。
          try{ localStorage.setItem('hub_reset_pending', '1'); }catch(e){}
          toast('本地已清空，但云端同步失败，已记待补传');
        }
        reload();
      });
    } else {
      reload();
    }
  }
}
