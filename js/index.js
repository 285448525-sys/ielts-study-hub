ready(() => {
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };
  const s = (DATA && DATA.settings) || {};
  const tkey = todayKey();
  const todays = (DATA.sessions || []).filter(x => x.date === tkey);
  const totalSec = todays.reduce((a,x) => a + x.durationSec, 0);

  safe(() => {
    $('#userName').textContent = s.name || 'Camille';
    const cd = examCountdown();
    $('#dashCountdown').textContent = cd.hasExam
      ? ('距 ' + cd.md + (cd.daysLeft < 0 ? '（' + cd.label + '）' : ' 还有 ' + cd.label))
      : '未设置考试日期';
    $('#stTime').textContent = fmtHM(totalSec);
    $('#stGoal').textContent = s.dailyGoalHours || 8;
    // 方案：今日进度条（C 窗口 Dashboard 优化）
    const goalSec = (s.dailyGoalHours || 8) * 3600;
    const pct = goalSec > 0 ? Math.min(100, Math.round(totalSec / goalSec * 100)) : 0;
    const _fill = document.getElementById('stFill'); if(_fill) _fill.style.width = pct + '%';
    const _stp  = document.getElementById('stPct');  if(_stp)  _stp.textContent  = pct + '%';
    const st = $('#startTitle'), sb = $('#startSub');
    if(todays.length > 0){ st.textContent = '继续上次'; sb.textContent = '今天已学 ' + fmtHM(totalSec) + '，继续加油'; }
    else { st.textContent = '开始今日学习'; sb.textContent = '选模块，开一个计时器'; }
  });

  safe(renderStreak);
  safe(renderMedSnippet);
  safe(renderReminders);
  safe(renderAiReadiness);   // 方案3：首屏 AI 就绪状态条
  // （Zone 4 收藏区已迁移至侧边栏常驻收藏区，相关渲染逻辑已移除）

  window.__hubSessionSaved = () => safe(() => {
    const tk = todayKey();
    const td = DATA.sessions.filter(x => x.date === tk);
    const ts = td.reduce((a,x) => a + x.durationSec, 0);
    const te = $('#stTime'); if(te) te.textContent = fmtHM(ts);
    // 方案：计时保存后进度条实时涨（C 窗口 Dashboard 优化）
    const goalSec = (DATA.settings.dailyGoalHours || 8) * 3600;
    const pct = goalSec > 0 ? Math.min(100, Math.round(ts / goalSec * 100)) : 0;
    const _fill = document.getElementById('stFill'); if(_fill) _fill.style.width = pct + '%';
    const _stp  = document.getElementById('stPct');  if(_stp)  _stp.textContent  = pct + '%';
    const st = $('#startTitle'), sb = $('#startSub');
    if(td.length > 0){ st.textContent='继续上次'; sb.textContent='今天已学 '+fmtHM(ts)+'，继续加油'; }
    else { st.textContent='开始今日学习'; sb.textContent='选模块，开一个计时器'; }
    // 今日模块分布图表已从首页移除
  });
  document.removeEventListener('hub:session-saved', window.__hubSessionSaved);
  document.addEventListener('hub:session-saved', window.__hubSessionSaved);
});

function renderAiReadiness(){
  const el = $('#aiReadiness'); if(!el) return;
  const hasKey = !!(DATA.settings && DATA.settings.relayToken);
  if(hasKey){
    el.className = 'ai-readiness ok';
    el.innerHTML = '<span class="ar-ico">✅</span><span class="ar-text">AI 已就绪 · 串题 / 诊断 / 写作评分 / 万能素材可用</span>';
  } else {
    el.className = 'ai-readiness warn';
    el.innerHTML = '<span class="ar-ico">⚠️</span><span class="ar-text">AI 未配置 · 口语串题 / 诊断 / 写作评分 / 万能素材暂不可用</span>'
      + '<button class="ar-btn" id="arSetupBtn" type="button">去设置</button>';
    const b = $('#arSetupBtn');
    if(b) b.addEventListener('click', () => { try{ softNavigate({ id:'settings', file:'settings.html', href:'settings.html' }, false); }catch(e){ location.href = 'settings.html'; } });
  }
}

function renderMedSnippet(){
  const el = $('#stMed'); if(!el) return;
  const tkey = todayKey();
  const todays = DATA.meds.filter(m => m.date === tkey).sort((a,b)=>b.ts-a.ts);
  if(todays.length === 0){ el.textContent = '💊 未记录服药'; return; }
  const latest = todays[0];
  const remain = MED_DURATION_MS - (Date.now() - latest.ts);
  el.textContent = remain > 0 ? '💊 药效中' : '💊 已失效';
}

/* renderQuickLinks 已移除：收藏快捷入口已迁移至侧边栏常驻收藏区 */

function renderFavLinks(){
  const links = DATA.settings.links || [];
  const box = $('#favLinks');
  if(!box) return;
  if(links.length === 0){
    box.innerHTML = renderEmpty('常用网址被清空了') +
      '<div style="margin-top:10px"><button class="btn btn-primary" id="restoreLinksBtn">↺ 一键恢复默认常用网址</button></div>';
    const rb = $('#restoreLinksBtn');
    if(rb) rb.addEventListener('click', () => { if(typeof restoreDefaultLinks === 'function') restoreDefaultLinks(); });
    return;
  }
  box.innerHTML = '<div class="fav-links">' + links.map(l => {
    const isLocal = l.badge === '本地';
    const badgeHtml = isLocal
      ? '<span class="badge local">本地</span>'
      : (l.url ? '<a class="btn btn-sm" href="' + escapeHtml(l.url) + '" target="_blank" rel="noreferrer">打开</a>' : '');
    return '<div class="fav-link-item">' +
      '<div class="fav-link-info">' +
        '<div class="fav-link-name">' + escapeHtml(l.name) + '</div>' +
        (l.note ? '<div class="fav-link-note muted">' + escapeHtml(l.note) + '</div>' : '') +
      '</div>' +
      '<div class="fav-link-action">' + badgeHtml + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderStreak(){
  const el = $('#stStreak'); if(!el) return;
  const checkins = DATA.checkins || [];
  el.textContent = computeStreak(checkins);
  const btn = $('#checkinBtn');
  const today = todayKey();
  const checked = checkins.includes(today);
  if(btn){
    btn.textContent = checked ? '✓' : '打卡';
    btn.disabled = checked;
    if(!checked) btn.onclick = () => {
      DATA.checkins = DATA.checkins || [];
      if(!DATA.checkins.includes(today)){ DATA.checkins.push(today); hubSave(); }
      toast('🔥 打卡成功，连续 ' + computeStreak(DATA.checkins) + ' 天');
      renderStreak();
    };
  }
}

function renderReminders(){
  const box = $('#reminderLine'); if(!box) return;
  const tkey = todayKey();
  const tips = [];
  if(!(DATA.sessions||[]).some(x => x.date === tkey)) tips.push('今天还没开始学习，去「计时」开个计时器');
  // 空状态引导：词库为空时提示去「我的词库」加词（新用户首屏）
  if(!DATA.words || DATA.words.length === 0) tips.push('词库还是空的，去「我的词库」加几个单词吧');
  const cd = examCountdown();
  if(cd.hasExam && cd.daysLeft !== null && cd.daysLeft >= 0 && cd.daysLeft <= 7) tips.push('距考试仅剩 ' + cd.daysLeft + ' 天');
  const due = (DATA.words||[]).filter(w => !w.mcDue || w.mcDue <= tkey).length;
  if(due > 0) tips.push(due + ' 个单词待复习');
  box.innerHTML = tips.length ? '💡 ' + tips.join(' · ') : '';
}

/* genSummary 已移除：今日总结入口随 Zone 4 一并移除 */

/* renderPieChart 已移除：今日模块分布图表随 Zone 4 一并移除 */
