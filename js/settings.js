// 10-23 T-002 步5：applyFontScale / applyReduceMotion 定义在 js/common.js（每页都要能用），
// 这里只负责表单回填与落库后的即时应用。

// 把当前 DATA.settings 回填到设置页表单（登录合并云端数据后调用，确保「目标分数/每日目标」等可见恢复）
function populateSettingsForm(){
  const s = DATA.settings || {};
  if($('#sName')) $('#sName').value = s.name || '';
  if($('#sExam')) $('#sExam').value = s.examDate || '';
  /* 10/2（她拍板）：「距考试 N 天」徽章整删（顶得布局很丑）——settingsCountdown 相关渲染退役；考试倒计时首页/冲刺卡仍有 */
  if($('#sGoal')) $('#sGoal').value = s.dailyGoalHours || '';
  /* TH-SYS（10-25）：主题三值 —— 'auto' 时动画开关按系统当前深浅摆位（视觉与页面一致），
     真正的「跟随系统」状态由 #sThemeAuto 表达。脏值一律当 light（施工书 §2.2）。 */
  var _th = (s.theme === 'dark' || s.theme === 'auto') ? s.theme : 'light';
  var _sysDark = false;
  try{ _sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches; }catch(e){}
  if($('#sThemeToggle')) $('#sThemeToggle').checked = (_th === 'dark') || (_th === 'auto' && _sysDark);
  if($('#sThemeAuto')) $('#sThemeAuto').checked = (_th === 'auto');

  /* KIMI-THEME-1（10-26）：主题外观三选一回填（独立 localStorage 键，不进 DATA.settings ——
     同步白名单归 A 管，外观偏好本机优先，避免动共享层）。
     缺省 ink（青墨学术）＝她的默认；A 还没落地变量前，这一行点了不换颜色但也不报错。 */
  try{
    var _scheme = localStorage.getItem('hub_theme_scheme') || 'ink';
    if (_scheme !== 'ink' && _scheme !== 'cool' && _scheme !== 'warm') _scheme = 'ink';
    document.querySelectorAll('.set-scheme-tab[data-scheme]').forEach(function(b){
      var on = b.getAttribute('data-scheme') === _scheme;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }catch(e){}

  const t = s.targets || {};
  if($('#tOverall')) $('#tOverall').value = t.overall || '';
  if($('#tListening')) $('#tListening').value = t.listening || '';
  if($('#tReading')) $('#tReading').value = t.reading || '';
  if($('#tWriting')) $('#tWriting').value = t.writing || '';
  if($('#tSpeaking')) $('#tSpeaking').value = t.speaking || '';

  if($('#sPron')) $('#sPron').value = (s.pronunciationScore != null ? s.pronunciationScore : '');
  if($('#sFlu')) $('#sFlu').value = (s.fluencyScore != null ? s.fluencyScore : '');
  /* F-4（10-25）：#sChime / #sReduceMotion / #sAdhd 三个控件已分别被 S-1、S-1b 删掉（settings.html 里实测 0 处）→ 回填这三行是纯空转，清掉。字段 chimeOnDone / reduceMotion / adhd 一律保留（同步白名单里，数据不丢）。 */
  // 10-23 T-002 步5：正文字号（缺省 md=标准）与减少动效（缺省关）回填
  const _font = (s.fontScale === 'sm' || s.fontScale === 'lg') ? s.fontScale : 'md';
  if(typeof applyFontScale === 'function') applyFontScale(_font);
  // 9/21 翻转：服药模块默认关闭 → 无该函数时兜底 false（与 common.js 口径一致）
  /* 10/3 22:55：#sAcct 登录表单已删（她拍板「未登录不裸填账号密码，改成引导去 login.html」），
     预填逻辑一并移除。 */
}

ready(() => {
  populateSettingsForm();
  renderSyncState();

  // 10/1 晚 · 自动保存（她拍板删「保存全部设置」条）：任一设置项 change → 600ms 防抖 → saveSettings
  // 主题开关/服药开关有自己的即时 handler，不走这条防抖通道
  const AUTO_SAVE_IDS = ['sName','sExam','sGoal','tOverall','tListening','tReading','tWriting','tSpeaking','sPron','sFlu'];   /* F-4：sChime 已删（S-1），留着它只是空转 */
  let _autoSaveTimer = null;
  const autoSave = () => { clearTimeout(_autoSaveTimer); _autoSaveTimer = setTimeout(saveSettings, 600); };
  /* 🔴 10/4 16:50：原来**只绑 change**。change 只在「值改变且失焦」时触发 ——
     她 16:40 报「设置页改了个寂寞、点不动」，探针 `_tmp_inp` 实锤：逐字输入后
     `DATA.settings.targets` 仍是 no-DATA（没失焦 → change 没跑 → **填的东西没存**）。
     表现就是「我明明填了/点了，一刷新就没」，很容易被当成「点不动」。
     修：**input（每次按键）+ change（失焦）都绑**，防抖 600ms 不变，输入过程本身就有可见反馈。 */
  AUTO_SAVE_IDS.forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    el.addEventListener('input', autoSave);
    el.addEventListener('change', autoSave);
  });
  /* KIMI-THEME-1（10-26）：主题外观三选一。
     🔴 写入三样：localStorage 键 hub_theme_scheme（本机外观偏好，不进 DATA.settings ——
        同步白名单归 A 管，不动共享层）+ documentElement.dataset.scheme（A 的 CSS 按 [data-scheme] 写变量）。
     ⚠️ 不动 #sThemeToggle / #sThemeAuto 一行 —— 深浅（light/dark/auto）与三套外观是两组正交的东西。 */
  if(!window.__wmSchemeBound){
    window.__wmSchemeBound = true;
    var _schemeTabs = document.querySelectorAll('.set-scheme-tab[data-scheme]');
    if(_schemeTabs.length){
      _schemeTabs.forEach(function(b){
        b.addEventListener('click', function(){
          var v = b.getAttribute('data-scheme') || 'ink';
          _schemeTabs.forEach(function(x){
            var on = x === b;
            x.classList.toggle('on', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          try{ localStorage.setItem('hub_theme_scheme', v); }catch(e){}
          try{ document.documentElement.setAttribute('data-scheme', v); }catch(e){}
          try{ if(typeof toast === 'function') toast('主题外观已切换'); }catch(e){}
        });
      });
      /* 进页面就应用一次（本机存过才应用，缺省 ink 不写属性 —— 与「老用户零感知」一致） */
      var _saved = localStorage.getItem('hub_theme_scheme');
      if(_saved === 'cool' || _saved === 'warm'){
        document.documentElement.setAttribute('data-scheme', _saved);
      }
    }
  }

  /* ═══ SET-1（10-26）· 身份卡「点用户名就地改名」 ═══
     稿子 design/_样子稿-设置页合并账号-2026-10-26.html：点 .me-name → 变输入框 + 保存/取消；
     Enter 保存、Esc 取消。**保存仍走原来那条路**（#sName 的 input/change → 600ms 防抖 → saveSettings），
     所以这里不新造保存逻辑：切到输入态时把当前值灌进 #sName，改完派发 input，
     再借 AUTO_SAVE_IDS 里已绑的通道落库（零新逻辑）。
     🔴 幂等标记打元素上（软导航换 <main> 后元素是新的，window 级标记会挡住重绑）。 */
  (function bindInlineRename(){
    var row = $('#nameRow'), edit = $('#editRow'), txt = $('#nameTxt');
    var inp = $('#sName'), saveBtn = $('#nameSave'), cancelBtn = $('#nameCancel');
    if(!row || !edit || !txt || !inp) return;
    if(txt.__set1Bound) return;
    txt.__set1Bound = true;

    function openEdit(){
      edit.hidden = false;
      row.hidden = true;
      inp.value = (DATA.settings && DATA.settings.name) || '';
      try{ inp.focus(); inp.select && inp.select(); }catch(e){}
    }
    function closeEdit(){
      edit.hidden = true;
      row.hidden = false;
    }
    function commit(){
      var v = String(inp.value || '').trim();
      if(v.length > 24) v = v.slice(0, 24);
      inp.value = v;
      /* 走既有保存路径：直接调 saveSettings()（与 AUTO_SAVE_IDS 那套防抖落到同一个函数），
         然后把输入框失焦 —— 防抖那支只在 input/change 时才跑，这里显式调更稳，
         也不会因为只派发事件而漏掉 _fieldTs 打戳（云端合并靠它判谁新）。 */
      try{
        if(typeof saveSettings === 'function') saveSettings();
      }catch(e){}
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      if(txt) txt.textContent = v || (DATA.settings && DATA.settings.syncCode) || '未登录';
      closeEdit();
      try{ if(typeof toast === 'function') toast('用户名已保存'); }catch(e){}
    }

    txt.addEventListener('click', openEdit);
    txt.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openEdit(); }
    });
    if(saveBtn) saveBtn.addEventListener('click', commit);
    if(cancelBtn) cancelBtn.addEventListener('click', closeEdit);
    inp.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      else if(ev.key === 'Escape'){ ev.preventDefault(); closeEdit(); }
    });
  })();

  /* TH-SYS（10-25）：这一行原来是**裸绑定**（$('#sThemeToggle').addEventListener）。
     保持元素 id 不变 + 就地判空 —— 以后谁再删这个 input 也不会把后面 27 处绑定全断掉。 */
  var _themeEl = $('#sThemeToggle');
  if(_themeEl){
    _themeEl.addEventListener('change', () => {
      const dark = _themeEl.checked;
      /* 跟随系统开着时，动画开关只是「临时看一眼」，不落库成 light/dark（否则 auto 被覆盖） */
      var _autoOn = $('#sThemeAuto') && $('#sThemeAuto').checked;
      DATA.settings.theme = _autoOn ? 'auto' : (dark ? 'dark' : 'light');
      applyTheme();
      hubSave();
      if(DATA.settings.syncCode) scheduleCloudUpload();
    });
  }
  /* TH-SYS：「跟随系统」开关 —— 打开 = auto，关掉 = 按当前实际深浅落成 light/dark */
  var _autoEl = $('#sThemeAuto');
  if(_autoEl){
    _autoEl.addEventListener('change', () => {
      var on = _autoEl.checked === true;
      if(on){
        DATA.settings.theme = 'auto';
      }else{
        var nowDark = false;
        try{ nowDark = document.documentElement.getAttribute('data-theme') === 'dark'; }catch(e){}
        DATA.settings.theme = nowDark ? 'dark' : 'light';
        if($('#sThemeToggle')) $('#sThemeToggle').checked = nowDark;
      }
      applyTheme();
      hubSave();
      if(DATA.settings.syncCode) scheduleCloudUpload();
      try{ if(typeof toast === 'function') toast(on ? '主题已跟随系统' : '主题已改为手动'); }catch(e){}
    });
  }
  /* F-4（10-25）：整块删除「服药模块开关的即时绑定」—— #sAdhd 已由 S-1 整行删掉（她 23:5x「两个都删说过了」，settings.html 实测 0 处）。⚠️ medsModuleOn() / meds.html / DATA.meds 一个都没动，只是这个开关的回填与监听退役。 */

  /* 🔴 S-2（10-25）：下面四行裸绑定**整块删除** —— 她 00:4x「叫你把数据备份页删掉啊」。
     原写法是 $('#exportBtn').addEventListener(...) 等四行，**没有判空**：
     $ = document.querySelector（js/common-shell.js:7），取不到就返回 null →
     删了 HTML 后第 76 行立刻抛 TypeError: Cannot read properties of null，
     **后面 27 处 $('#...') 绑定全部不执行**（保存/回填/字号/主题全废）。
     这不是理论风险 = #resetBtn 那次事故的翻版（settings.html 原有注释记录）。
     ⇒ 四个 id 全没了，绑了也没意义 → 直接删，不是加判空。
     ⚠️ exportData / importData / resetData 三个**函数本体保留不删**（在下面），
        将来想恢复只差补 HTML。 */

  /* 10/3 22:55：登录 / 设密码的表单与按钮已整块删除（她拍板「未登录就显示未登录 + 一个按钮
     引导去专门的登录页」）。authLogin / authRegister / authFinishRegister 函数本身在
     common.js 一字未动，login.html 继续用 —— 这里只是设置页不再调它们。
     被删的绑定：#syncLoginBtn click / #sPass keydown(Enter) / #syncRegisterBtn click。 */
  $('#syncChangeBtn').addEventListener('click', () => {
    const f = $('#syncChangeForm');
    if(f) f.style.display = (f.style.display === 'none' || !f.style.display) ? '' : 'none';
  });
  $('#syncChangeSave').addEventListener('click', async () => {
    const r = await authChangePassword($('#sOldPass') ? $('#sOldPass').value : '', $('#sNewPass') ? $('#sNewPass').value : '');
    if(r.ok){
      const f = $('#syncChangeForm'); if(f) f.style.display = 'none';
      const o = $('#sOldPass'), n = $('#sNewPass');
      if(o) o.value = ''; if(n) n.value = '';
    }
  });
  $('#syncLogoutBtn').addEventListener('click', async () => {
    if(!confirm('退出登录后停止云同步（本机数据保留）。确定退出？')) return;
    await authLogout();
    renderAuthUI();
  });
  // 检查同步状态 / 立即同步到云端 两按钮已删（她 10/1 晚拍板：自动同步足够，syncDiagnose 函数保留备用）
  renderAuthUI();

  // 云端合并完成后回填表单：登录/其他设备同步后，让「目标分数/每日目标」等立即可见。
  // 若用户正在表单里输入（焦点在某设置输入框），则不覆盖，避免打断输入。
  document.addEventListener('hub:data-merged', () => {
    const a = document.activeElement;
    if(a && a.tagName === 'INPUT' && /^[ts]/.test(a.id || '')) return;
    populateSettingsForm();
  });
});

function saveSettings(){
  // 只给「真的变了」的字段赋值+打 _fieldTs 时间戳。
  // ⚠️ 旧写法无差别全字段盖 now：新设备上只改个主题/随便存一次，全 0 的 targets（默认值=未填）
  // 也被打上最新时间戳 → 登录合并时「本机较新」压过云端真值 → 目标分换设备同步丢失（之之 9/6 反馈，S2/S5 复现）。
  const now = Date.now();
  DATA.settings._fieldTs = DATA.settings._fieldTs || {};
  const _set = (f, v) => {
    if(JSON.stringify(DATA.settings[f]) !== JSON.stringify(v)){
      DATA.settings[f] = v;
      DATA.settings._fieldTs[f] = now;
    }
  };
  _set('name', $('#sName').value.trim());
  _set('examDate', $('#sExam').value);
  // 一律清空历史多场日程数组：examDate 是唯一有效来源。旧逻辑仅在有值时清，
  // 会漏掉「用户清空日期」——残留的 examDates 会让 nextExamDate() 回退显示已废弃的旧档期（倒计时复活）
  _set('examDates', []);
  _set('dailyGoalHours', parseFloat($('#sGoal').value) || 0);
  /* TH-SYS（10-25）：三值 + 判空（原来是裸读 .checked，元素一没就抛）。
     'auto' 优先：「跟随系统」开着就以它为准，否则看动画开关。 */
  var _saveAuto = $('#sThemeAuto');
  var _saveToggle = $('#sThemeToggle');
  _set('theme', (_saveAuto && _saveAuto.checked) ? 'auto' : ((_saveToggle && _saveToggle.checked) ? 'dark' : 'light'));
  _set('targets', {
    overall: parseFloat($('#tOverall').value) || 0,
    listening: parseFloat($('#tListening').value) || 0,
    reading: parseFloat($('#tReading').value) || 0,
    writing: parseFloat($('#tWriting').value) || 0,
    speaking: parseFloat($('#tSpeaking').value) || 0,
  });
  // syncCode（云端账号）只由登录流程写入，不再随「保存设置」表单乱写——密码体系下账号=登录态的一部分
  _set('autoSync', true); // 默认开启自动同步，与考研站一致（绑定后由 syncLoginOrRegister 控制）
  // 9/20 恢复：固定发音分 / 流利度分（0–9）由用户自填，空=不计入总分。字段一直在云同步列表里（换设备会带回）。
  // ⚠️ 三条铁律：① 输入框缺失时**绝不写 null**（会静默清掉已存值）；② 空串 → null（不填=不计入）；
  // ③ 0 是合法值必须落库（禁用 `parseFloat(x)||null`——会把 0 吞成没填）。
  const _band = (sel) => {
    const el = $(sel); if(!el) return undefined;          // 框不在：不动原值
    const v = String(el.value).trim(); if(v === '') return null;
    const x = parseFloat(v); return isNaN(x) ? null : x;
  };
  const _pron = _band('#sPron'); if(_pron !== undefined) _set('pronunciationScore', _pron);
  const _flu = _band('#sFlu');   if(_flu  !== undefined) _set('fluencyScore', _flu);
  /* F-4（10-25）：这里原来还有 3 行 `if($('#sChime'/'#sAdhd'/'#sReduceMotion')) _set(...)`，
     三个控件都已分别被 S-1 / S-1b 删掉（settings.html 实测 0 处）→ 纯空转，已清。
     ⚠️ 字段 chimeOnDone / adhd / reduceMotion **一律保留**在 common-sync.js 的
     SYNC_SETTINGS_FIELDS 白名单里，数据一条不丢（meds.html 与 DATA.meds 也保留）。
     ⚠️ 历史教训留档：这几行原先是**裸读**（$('#sChime').checked），元素一没就抛 TypeError
     中断整个 saveSettings →「设置保存了但后面几项没落库」；S-1 当时先改成判空，本批才彻底清。 */
  hubSave(); applyTheme();
  if(DATA.settings.syncCode) scheduleCloudUpload();   // 已登录则立即同步（含发音分等）到云端
  toast(DATA.settings.syncCode ? '设置已保存（已同步云端）' : '设置已保存');   // 未登录不谎报「已同步」
}

/* ===== design/80 安装到桌面（四态渲染，只放设置页） =====
   10/1 晚整卡已删（她拍板）：renderPwaCard/bindPwaCard 连同 #pwaCard 一起退役，
   安装入口保留在首页底部轻量条「📦 安装到桌面」。 */

/* AI Key 设置模块已下线（她 10/1 拍板：商业化后 AI 一律走站内通道，用户不接触 Key）。
   saveRelay/testAIConnection/setAiStatus/setAiLoading 已删；存量 DATA.settings.relayToken
   字段保留原地（callRelay 的 auto 逻辑继续认它，本机已存 Key 的设备零迁移）。 */

/* 讯飞语音配置已移除（录音 / 转写功能已下线，发音分改由设置里的固定分提供） */


/* ===== 10/1 账号 + 密码 认证UI（10/21 起账号只认邮箱） =====
   服务端 /api/auth（email_register/login/change/email_reset/logout），session token 由 common.js 管理。
   10/3 22:55：未登录态不再裸填表单 —— 改成「未登录 + 说明 + 一个去 login.html 的引导键」
   （DOM #syncLoginForm 整块删除，换成 #syncGuestBox；改密/退出仍留本页）。
   10/21：手机号/用户名通道前后端全删，登录注册只在 login.html 完成，本页只管改密与退出。
   恢复码机制已整套下线（她 10/1 拍板）。*/
function renderAuthUI(){
  const loggedIn = !!(DATA.settings.syncCode && typeof authToken === 'function' && authToken());
  const ub = $('#syncUserBox'), gb = $('#syncGuestBox');   // ← #syncLoginForm 已删
  if(ub) ub.style.display = loggedIn ? '' : 'none';
  if(gb) gb.hidden = loggedIn;
  const el = $('#syncUserAcct');
  /* 10/5 她 14:29：「用户名不是显示已登录这个是账号吗？用户名可以用我填写的用户名」
     → 顶栏大字改显示昵称（settings.name，即「个人设置」里填的 Camille）；
       没填昵称时才退回账号（syncCode），避免顶部空白。 */
  if(el) el.textContent = loggedIn ? ((DATA.settings.name || '').trim() || (DATA.settings.syncCode || '')) : '未登录';
  const st = $('#syncState');
  if(st && !loggedIn) st.textContent = '数据只存在这台设备';
  /* SET-1（10-26）：身份卡上的用户名 span 也一起刷（就地改名那套的显示位）。
     口径与上面 syncUserAcct 完全一致：有昵称显示昵称，否则退回账号，未登录显示「未登录」。 */
  const nt = $('#nameTxt');
  if(nt) nt.textContent = loggedIn ? ((DATA.settings.name || '').trim() || (DATA.settings.syncCode || '')) : '未登录';
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
      // ⭐ 9/30 noLock：清数据是「刻意要用空数据覆盖云端」，必须跳过乐观锁。
      //     不跳的话会因为 baseTs 陈旧而拿到 409 → 自动 cloudDownload 合并 → 刚清空的数据被云端整份复活。
      Promise.resolve(cloudUpload(false, true, { noLock: true })).then(ok => {
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
