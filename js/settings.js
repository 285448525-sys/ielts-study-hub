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

  $('#sRelayUrl').value = s.relayUrl || '';
  $('#sRelayToken').value = s.relayToken || '';
  $('#sRelayMode').value = s.relayMode || 'direct';

  $('#sSyncToken').value = s.syncToken || '';
  $('#sSyncCode').value = s.syncCode || '';
  $('#sAutoSync').checked = !!s.autoSync;
  $('#sNotify').checked = !!s.notifyEnabled;

  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveRelay').addEventListener('click', saveRelay);
  $('#sTheme').addEventListener('change', () => applyTheme($('#sTheme').value));
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  $('#resetBtn').addEventListener('click', resetData);

  // 云端同步
  $('#genCodeBtn').addEventListener('click', () => {
    const code = genSyncCode();
    DATA.settings.syncCode = code; $('#sSyncCode').value = code; hubSave();
    toast('已生成登录码：' + code + '（已保存）');
  });
  $('#copyCodeBtn').addEventListener('click', () => {
    const code = $('#sSyncCode').value.trim();
    if(!code){ toast('请先生成或填入登录码'); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(code).then(() => toast('已复制：' + code), () => toast('复制失败，请手动选'));
    } else { toast('复制失败，请手动选'); }
  });
  $('#sSyncCode').addEventListener('change', () => { DATA.settings.syncCode = $('#sSyncCode').value.trim(); hubSave(); });
  $('#sSyncToken').addEventListener('change', () => { DATA.settings.syncToken = $('#sSyncToken').value.trim(); hubSave(); });
  $('#sAutoSync').addEventListener('change', () => { DATA.settings.autoSync = $('#sAutoSync').checked; hubSave(); if(DATA.settings.autoSync) cloudUpload(true); });
  $('#sNotify').addEventListener('change', () => {
    DATA.settings.notifyEnabled = $('#sNotify').checked; hubSave();
    if(DATA.settings.notifyEnabled) requestNotify();
  });
  $('#uploadBtn').addEventListener('click', () => cloudUpload(true));
  $('#downloadBtn').addEventListener('click', () => cloudDownload());
  $('#delCloudBtn').addEventListener('click', () => cloudDelete());

  renderLinks();
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
  DATA.settings.syncToken = $('#sSyncToken').value.trim();
  DATA.settings.syncCode = $('#sSyncCode').value.trim();
  DATA.settings.autoSync = $('#sAutoSync').checked;
  DATA.settings.notifyEnabled = $('#sNotify').checked;
  hubSave(); applyTheme(); toast('设置已保存');
  if(DATA.settings.notifyEnabled) requestNotify();
}

function saveRelay(){
  DATA.settings.relayMode = $('#sRelayMode').value || 'direct';
  DATA.settings.relayUrl = $('#sRelayUrl').value.trim();
  DATA.settings.relayToken = $('#sRelayToken').value.trim();
  hubSave();
  const isDirect = DATA.settings.relayMode === 'direct';
  toast(isDirect ? '已保存：直连模式（Key 仅存本地浏览器）' : '已保存：中转模式（Key 存在服务器端）');
}
// 快捷地址填充
const relaySuggests = {
  ds:  { url:'https://api.deepseek.com/v1', hint:'注册：platform.deepseek.com → API Keys，送免费额度' },
  groq:{ url:'https://api.groq.com/openai/v1', hint:'console.groq.com/keys，免费 30 RPM' },
  silicon:{ url:'https://api.siliconflow.cn/v1', hint:'siliconflow.cn，中文模型强，送额度' },
  aigcbar:{ url:'https://api.aigc.bar/v1', hint:'api.aigc.bar，国内低延迟' },
  openrouter:{ url:'https://openrouter.ai/api/v1', hint:'openrouter.ai，聚合 20+ 免费模型' }
};
document.querySelectorAll('[data-relay-suggest]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const key = a.dataset.relaySuggest;
    const s = relaySuggests[key]; if(!s) return;
    $('#sRelayUrl').value = s.url;
    toast('已填入 ' + s.hint);
  });
});
// 模式切换时更新提示文字
$('#sRelayMode').addEventListener('change', () => {
  const hint = $('#relayHint');
  if($('#sRelayMode').value === 'relay'){
    hint.textContent = '💡 中转模式：运行 relay/relay-server.js，API Key 存在服务器 config 里';
  } else {
    hint.innerHTML = '💡 常用地址：<a href="#" data-relay-suggest="ds">DeepSeek</a> · <a href="#" data-relay-suggest="groq">Groq</a> · <a href="#" data-relay-suggest="silicon">硅基流动</a> · <a href="#" data-relay-suggest="aigcbar">AIGC BAR</a> · <a href="#" data-relay-suggest="openrouter">OpenRouter</a>';
    document.querySelectorAll('[data-relay-suggest]').forEach(a2 => {
      a2.addEventListener('click', e => {
        e.preventDefault();
        const key2 = a2.dataset.relaySuggest;
        const s2 = relaySuggests[key2]; if(!s2) return;
        $('#sRelayUrl').value = s2.url;
        toast('已填入 ' + s2.hint);
      });
    });
  }
});

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

function resetData(){
  if(confirm('⚠️ 确定清空所有数据？此操作不可恢复，请先导出备份。')){
    DATA = { sessions:[], notes:[], meds:[], words:[], settings: DATA.settings };
    hubSave(); toast('已清空数据'); setTimeout(() => location.reload(), 600);
  }
}

