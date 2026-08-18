/* 快捷入口配色：用 var 而非 const（软导航 window.eval 重跑本脚本时，const 重复声明会抛 SyntaxError）。
   必须放在 ready() 之前——defer 脚本执行时 readyState 已 interactive，ready 回调会同步立即执行，
   若 QL_ACCENT 定义在其后，renderQuickLinks 访问 QL_ACCENT[p.id] 会因尚未赋值而抛 "reading 'timer'"。 */
var QL_ACCENT = {
  timer:    ['var(--primary-soft)',        'var(--primary)'],
  plans:    ['var(--primary-soft)',        'var(--primary)'],
  errorbook:['rgba(239,68,68,0.10)',       'var(--danger)'],
  writing:  ['rgba(245,158,11,0.10)',      'var(--warn)'],
  speaking: ['rgba(70,168,131,0.10)',      '#46a883'],
  words:    ['rgba(139,92,246,0.10)',      '#8b5cf6'],
  practice: ['rgba(139,92,246,0.10)',      '#8b5cf6'],
  corpus:   ['rgba(6,182,212,0.10)',       '#06b6d4'],
  longsent: ['rgba(6,182,212,0.10)',       '#06b6d4'],
  meds:     ['rgba(236,72,153,0.10)',      '#ec4899'],
  scores:   ['var(--primary-soft)',        'var(--primary)'],
  history:  ['rgba(95,122,120,0.12)',     '#5f7a78'],
  settings: ['rgba(95,122,120,0.12)',     '#5f7a78']
};

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
  safe(() => { const b = $('#todayBars'); if(b){ const bySub={}; todays.forEach(x=>bySub[x.subName]=(bySub[x.subName]||0)+x.durationSec); b.innerHTML = Object.keys(bySub).length===0 ? renderEmpty('今天还没有学习记录') : renderPieChart(bySub); } });
  safe(renderFavLinks);
  safe(renderQuickLinks);   // 我的收藏（站内页面快捷入口）
  safe(() => { const btn = $('#genSummaryBtn'); if(btn) btn.addEventListener('click', genSummary); });

  // 收藏列表变更：在别的页面切收藏，首页「我的收藏」即时刷新（不用切走再回来）。
  // common.js 的 toggleFav 已在切星标后派发 hub:favchange；此处监听真正干活。
  window.__hubFavChange = () => { try{ renderQuickLinks(); }catch(e){ console.error('[index] 快捷入口刷新失败', e); } };
  document.removeEventListener('hub:favchange', window.__hubFavChange);
  document.addEventListener('hub:favchange', window.__hubFavChange);

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
    const tb = $('#todayBars'); if(tb){ const bySub={}; td.forEach(x=>bySub[x.subName]=(bySub[x.subName]||0)+x.durationSec); tb.innerHTML = Object.keys(bySub).length===0?renderEmpty('今天还没有学习记录'):renderPieChart(bySub); }
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

function renderQuickLinks(){
  const box = $('#quickLinks');
  if(!box) return;
  const ids = (typeof favPageIds === 'function') ? favPageIds() : [];
  const pages = ids.map(id => PAGES.find(p => p.id === id)).filter(p => p && p.id !== 'index');
  if(pages.length === 0){
    box.innerHTML = '<div class="muted" style="grid-column:1/-1;padding:6px 0">还没收藏页面。点侧边栏任意页面右侧的 ♡ 就会钉到这里。</div>';
    return;
  }
  box.innerHTML = pages.map(p => {
    const accent = (typeof QL_ACCENT !== 'undefined' && QL_ACCENT[p.id]) || ['var(--primary-soft)', 'var(--primary)'];
    const [bg, fg] = accent;
    return '<a class="quick-link" href="' + p.file + '">' +
      '<span class="ql-icon" style="background:' + bg + ';color:' + fg + '">' + p.icon + '</span>' +
      '<div><b>' + escapeHtml(p.name) + '</b><span class="muted">' + escapeHtml(p.desc || '') + '</span></div>' +
    '</a>';
  }).join('');
}

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
  if(!(DATA.sessions||[]).some(x => x.date === tkey)) tips.push('今天还没开始学习，去「计时学习」开个计时器');
  // 空状态引导：词库为空时提示去「我的词库」加词（新用户首屏）
  if(!DATA.words || DATA.words.length === 0) tips.push('词库还是空的，去「我的词库」加几个单词吧');
  const cd = examCountdown();
  if(cd.hasExam && cd.daysLeft !== null && cd.daysLeft >= 0 && cd.daysLeft <= 7) tips.push('距考试仅剩 ' + cd.daysLeft + ' 天');
  const due = (DATA.words||[]).filter(w => !w.mcDue || w.mcDue <= tkey).length;
  if(due > 0) tips.push(due + ' 个单词待复习');
  box.innerHTML = tips.length ? '💡 ' + tips.join(' · ') : '';
}

function genSummary(){
  const tkey = todayKey();
  const todays = DATA.sessions.filter(x => x.date === tkey);
  const totalSec = todays.reduce((a,x) => a + x.durationSec, 0);
  const goalSec = (DATA.settings.dailyGoalHours || 8) * 3600;
  const pct = goalSec > 0 ? Math.round(totalSec/goalSec*100) : 0;
  const pauseSec = todays.reduce((a,x) => a + (x.pauseSec||0), 0);
  const subNames = [...new Set(todays.map(x => x.subName))];

  let lines = [];
  lines.push('📅 ' + tkey + ' 学习总结\n');
  lines.push('⏱ 总时长：' + fmtHM(totalSec) + ' / 目标 ' + (DATA.settings.dailyGoalHours||8) + 'h（' + pct + '%）');
  if(pauseSec > 0){ const wallSec = totalSec + pauseSec; const focusPct = wallSec > 0 ? Math.round(totalSec/wallSec*100) : 100; lines.push('⏸ 暂停时间：' + fmtHM(pauseSec) + '（专注度 ' + focusPct + '%）'); }
  lines.push('📚 覆盖子模块：' + subNames.length + ' 个（' + (subNames.join('、') || '无') + '）');

  // per-module breakdown
  const bySub = {};
  todays.forEach(x => bySub[x.subName] = (bySub[x.subName]||0) + x.durationSec);
  if(Object.keys(bySub).length > 0){
    lines.push('\n📊 分模块时长：');
    Object.entries(bySub).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => {
      lines.push('  · ' + k + '：' + fmtHM(v));
    });
  }

  // recent scores
  const recent = (DATA.scores || []).slice(-3).reverse();
  if(recent.length > 0){
    lines.push('\n📈 最近模考：');
    recent.forEach(s => {
      lines.push('  · ' + s.date + ' 总分 ' + (s.overall||'-') + '（L' + (s.listening||'-') + ' R' + (s.reading||'-') + ' W' + (s.writing||'-') + ' S' + (s.speaking||'-') + '）');
    });
  }

  // exam countdown
  const cd = examCountdown();
  if(cd.hasExam && cd.daysLeft !== null && cd.daysLeft >= 0){
    lines.push('\n⏳ 距离考试还有 ' + cd.daysLeft + ' 天');
  }

  const el = $('#summaryOutput');
  if(!el) return;  // 容器缺失时静默退出，避免 null.style 抛 TypeError 把整页脚本带崩

  const text = lines.join('\n');
  el.style.display = 'block';
  el.innerHTML =
    '<div style="white-space:pre-wrap;line-height:1.8;color:var(--ink);background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--line)">' + escapeHtml(text) + '</div>' +
    '<div style="margin-top:10px"><button class="btn btn-sm" id="copySummaryBtn">📄 复制文本</button></div>';

  const cb = $('#copySummaryBtn');
  if(cb) cb.addEventListener('click', () => {
    if(typeof copyText === 'function'){
      copyText(text).then(() => toast('已复制今日总结'));
    } else {
      toast('复制不可用，请手动选中文本');
    }
  });
  toast('已生成今日总结');
}

function renderPieChart(data){
  const entries = Object.entries(data).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,[,v])=>a+v, 0);
  const colors = ['var(--primary)','var(--mock)','var(--vocab)','var(--warn)','var(--med)','var(--info)','#d99a4e','#46a883','#8b5cf6'];
  let acc = 0;
  const slices = entries.map(([k,v],i) => {
    const pct = v/total;
    const start = acc/total*360;
    acc += v;
    const end = acc/total*360;
    const color = colors[i % colors.length];
    return { k, v, pct, start, end, color };
  });
  // SVG donut chart
  const r = 60, cx = 80, cy = 80, sw = 28;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map(s => {
    const len = s.pct * circumference;
    const dash = `${len} ${circumference - len}`;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dasharray .4s ease"/>`;
    offset += len;
    return arc;
  }).join('');
  const legend = slices.map(s =>
    `<div style="display:flex;align-items:center;gap:6px;font-size:13px;margin:3px 0">
      <span style="width:12px;height:12px;border-radius:3px;background:${s.color};flex:none"></span>
      <span style="flex:1;color:var(--ink)">${escapeHtml(s.k)}</span>
      <span style="color:var(--muted);font-weight:600">${fmtHM(s.v)}</span>
      <span style="color:var(--muted);font-size:12px;width:36px;text-align:right">${Math.round(s.pct*100)}%</span>
    </div>`
  ).join('');
  return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <div style="position:relative;flex:none">
      <svg width="160" height="160" viewBox="0 0 160 160">${arcs}</svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--ink)">${fmtHM(total)}</div>
        <div style="font-size:11px;color:var(--muted)">总计</div>
      </div>
    </div>
    <div style="flex:1;min-width:140px">${legend}</div>
  </div>`;
}
