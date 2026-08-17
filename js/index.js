ready(() => {
  // 仪表盘各卡片独立渲染：任一模块报错不影响其他模块，避免「整片空白」
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };

  safe(() => {
    const s = DATA.settings;
    $('#userName').textContent = s.name || 'Camille';
    $('#examDate').textContent = s.examDate || '--';
    $('#targetOverall').textContent = (s.targets && s.targets.overall) || '6.0';
    $('#goalHours').textContent = s.dailyGoalHours || 8;

    const dLeft = daysUntil(s.examDate);
    $('#daysLeft').textContent = dLeft === null ? '--' : (dLeft < 0 ? '已过' : dLeft);
  });

  safe(() => {
    const tkey = todayKey();
    const todays = DATA.sessions.filter(x => x.date === tkey);
    const totalSec = todays.reduce((a,x) => a + x.durationSec, 0);
    $('#todayTime').textContent = fmtHM(totalSec);

    const goalSec = (DATA.settings.dailyGoalHours || 8) * 3600;
    const pct = goalSec > 0 ? Math.min(100, totalSec/goalSec*100) : 0;
    const reached = pct >= 100;
    $('#todayProgress').innerHTML = (reached ? '<div class="goal-done">🎉 今日目标已达成，太棒了！</div>' : '') + progressBar('今日进度', pct, reached ? 'var(--warn)' : 'var(--primary)');

    const bySub = {};
    todays.forEach(x => bySub[x.subName] = (bySub[x.subName]||0) + x.durationSec);
    if(Object.keys(bySub).length === 0){
      $('#todayBars').innerHTML = renderEmpty('今天还没有学习记录，去「计时学习」开始吧。');
    } else {
      $('#todayBars').innerHTML = renderPieChart(bySub);
    }
  });

  safe(renderQuickLinks);
  safe(renderFavLinks);
  safe(renderStreak);
  safe(renderReminders);
  safe(renderMedSnippet);

  safe(() => { const btn = $('#genSummaryBtn'); if(btn) btn.addEventListener('click', genSummary); });

  // 侧边栏点/取消收藏（心形）时就地刷新「快捷入口」，不依赖跨页全局函数
  window.__hubFavChange = () => safe(renderQuickLinks);
  document.removeEventListener('hub:favchange', window.__hubFavChange);
  document.addEventListener('hub:favchange', window.__hubFavChange);

  // 计时保存后自动刷新「今日已学」时长 + 进度条 + 饼图（无需手动 F5）
  window.__hubSessionSaved = () => safe(() => {
    const tkey = todayKey();
    const todays = DATA.sessions.filter(x => x.date === tkey);
    const totalSec = todays.reduce((a,x) => a + x.durationSec, 0);
    const te = $('#todayTime'); if(te) te.textContent = fmtHM(totalSec);
    const goalSec = (DATA.settings.dailyGoalHours || 8) * 3600;
    const pct = goalSec > 0 ? Math.min(100, totalSec/goalSec*100) : 0;
    const reached = pct >= 100;
    const pb = $('#todayProgress'); if(pb) pb.innerHTML = (reached ? '<div class="goal-done">🎉 今日目标已达成，太棒了！</div>' : '') + progressBar('今日进度', pct, reached ? 'var(--warn)' : 'var(--primary)');
    const bySub = {};
    todays.forEach(x => bySub[x.subName] = (bySub[x.subName]||0) + x.durationSec);
    const tb = $('#todayBars');
    if(tb){
      if(Object.keys(bySub).length === 0) tb.innerHTML = renderEmpty('今天还没有学习记录，去「计时学习」开始吧。');
      else tb.innerHTML = renderPieChart(bySub);
    }
  });
  document.removeEventListener('hub:session-saved', window.__hubSessionSaved);
  document.addEventListener('hub:session-saved', window.__hubSessionSaved);
});

function renderMedSnippet(){
  const tkey = todayKey();
  const todays = DATA.meds.filter(m => m.date === tkey).sort((a,b)=>b.ts-a.ts);
  if(todays.length === 0){
    $('#medStatus').textContent = '未服药';
    $('#medSub').textContent = '今天还没记录专注达';
    $('#medBar').innerHTML = '';
    return;
  }
  const latest = todays[0];
  const remain = MED_DURATION_MS - (Date.now() - latest.ts);
  const h = new Date(latest.ts).getHours(), mi = new Date(latest.ts).getMinutes();
  $('#medStatus').textContent = remain > 0 ? '药效中' : '已失效';
  $('#medSub').textContent = '服药 ' + pad2(h) + ':' + pad2(mi) + ' · 预计 ' + expireStr(latest.ts) + ' 结束';
  const pct = Math.min(100, (Date.now()-latest.ts)/MED_DURATION_MS*100);
  const cls = remain < 3600000 ? 'meds-bar low' : 'meds-bar';
  $('#medBar').innerHTML = `<div class="meds-bar-wrap"><div class="${cls}" style="width:${pct}%"></div></div>`;
}

/* 快捷入口：只渲染侧边栏 ⭐ 收藏过的页面（favPageIds() 与侧边栏「常用」同一份数据）
   用 var 而非 const：软导航重新执行 index.js 时，const 重复声明会抛 SyntaxError
   导致整段脚本中断，仪表盘大片内容消失。 */
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
    const [bg, fg] = QL_ACCENT[p.id] || ['var(--primary-soft)', 'var(--primary)'];
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
  const box = $('#streakBox'); if(!box) return;
  const checkins = DATA.checkins || [];
  const streak = computeStreak(checkins);
  const today = todayKey();
  const checked = checkins.includes(today);
  const total = checkins.length;
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">' +
      '<div style="text-align:center"><div style="font-size:30px;font-weight:800;color:var(--warn);line-height:1">🔥 ' + streak + '</div><div class="muted" style="font-size:12px">连续天数</div></div>' +
      '<div style="text-align:center"><div style="font-size:30px;font-weight:800;color:var(--primary);line-height:1">' + total + '</div><div class="muted" style="font-size:12px">累计打卡</div></div>' +
      '<button class="btn ' + (checked ? '' : 'btn-primary') + '" id="checkinBtn" ' + (checked ? 'disabled' : '') + '>' + (checked ? '✅ 今日已打卡' : '✅ 今日打卡') + '</button>' +
    '</div>';
  const btn = $('#checkinBtn');
  if(btn) btn.addEventListener('click', () => {
    const t = todayKey();
    DATA.checkins = DATA.checkins || [];
    if(!DATA.checkins.includes(t)){ DATA.checkins.push(t); hubSave(); }
    toast('🔥 打卡成功，连续 ' + computeStreak(DATA.checkins) + ' 天');
    renderStreak();
  });
}

function renderReminders(){
  const box = $('#reminderBox'); if(!box) return;
  const tkey = todayKey();
  const tips = [];
  const studiedToday = (DATA.sessions || []).some(s => s.date === tkey);
  if(!studiedToday){
    // P0-B：当天未学习时的「去计时」入口。保留主动跳转能力（href 仍走软导航），
    // 但文案更明确、视觉更克制（不再用填充按钮，避免被误触成「莫名跳计时页」）。
    tips.push({ icon:'📚', text:'今天还没有学习记录，点下面可去「计时学习」开一个计时器 🔥', action:{ label:'去开启今日计时', href:'timer.html' } });
  }
  const dLeft = daysUntil(DATA.settings.examDate);
  if(dLeft !== null && dLeft >= 0 && dLeft <= 7){
    tips.push({ icon:'⏳', text:'距离考试仅剩 <b>' + dLeft + '</b> 天，正是冲刺关键期！' });
  }
  const medToday = (DATA.meds || []).some(m => m.date === tkey);
  if(!medToday){
    tips.push({ icon:'💊', text:'今天还没记录专注达，记得在「服药记录」里打卡。' });
  }
  const due = (DATA.words || []).filter(w => !w.srsDue || w.srsDue <= tkey).length;
  if(due > 0){
    tips.push({ icon:'🧠', text:'有 <b>' + due + '</b> 个单词待复习（记忆曲线），去「单词练习」刷一下。', action:{ label:'去复习', href:'practice.html' } });
  }
  if(tips.length === 0){ box.innerHTML = '<div class="muted">👍 当前没什么要提醒的，保持节奏就好～</div>'; return; }
  box.innerHTML = tips.map(t =>
    '<div class="reminder-item">' +
      '<span class="reminder-icon">' + t.icon + '</span>' +
      '<div class="reminder-text">' + t.text + '</div>' +
      (t.action ? '<a class="reminder-action" href="' + t.action.href + '">' + t.action.label + ' →</a>' : '') +
    '</div>'
  ).join('');
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
  const dLeft = daysUntil(DATA.settings.examDate);
  if(dLeft !== null && dLeft >= 0){
    lines.push('\n⏳ 距离考试还有 ' + dLeft + ' 天');
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
