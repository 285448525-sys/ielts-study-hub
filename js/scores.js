/* MOCK_TYPES / BAND_TABLE / partIsScore / partWeight / estimateBand / targetCorrectFor
   已挪至 common.js（10/1：首页冲刺卡也要用这套估分，而 home.html 不加载 scores.js）。
   本文件只保留回顾页的录入与渲染逻辑。 */

/* 10/17 #9 层次 3：题型短代码 → 中文标签 + 进度条配色。
   🔴 必须声明在 ready() 之前：ready() 里会同步调 renderMock()，而 renderQtypeStats() 是函数声明（会提升）
   —— 本变量若不提前初始化，就会出现「函数存在但标签表还是 undefined」的怪异报错（10/17 实测踩到）。 */
var QTYPE_LABELS = {
  fill:   { name: '填空题',     color: 'var(--vocab)' },
  single: { name: '单选题',     color: 'var(--mock)' },
  multi:  { name: '多选题',     color: 'var(--med)' },
  match:  { name: '匹配题',     color: 'var(--warn)' },
  head:   { name: 'Heading 题', color: 'var(--primary)' },
  para:   { name: '段落匹配题', color: 'var(--vocab)' },
  map:    { name: '地图题',     color: 'var(--mock)' },
  other:  { name: '其他题型',   color: 'var(--muted)' },
};
ready(() => {
  $('#scoreDate').value = todayKey();
  $('#addScore').addEventListener('click', addScore);
  /* Tab 切换
     R-2：本页 tab 由 4 项变 2 项（成绩 / 轨迹）。原三个面板（#tab-breakdown /
     #tab-overall / #tab-speaking）已挂进 #tab-score 且不再是 .tab-panel，
     所以这里「清掉全部 .tab-panel」不会误伤它们 —— 它们跟着外层 #tab-score 一起显隐。
     ⚠️ 别改成「按父容器清」：本页的 .tab-panel 现在只有 #tab-score 与 #tab-record 两个，
        平铺在 .review-pane 下，清全部正是要的效果。
     ⚠️ 加 t 判空：tab-btn 里除了本页这两个，还有页面别处的 .tab-btn，
        点下去时 $('#tab-xxx') 可能不存在，原写法会抛 TypeError。 */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const t = $('#tab-' + btn.dataset.tab);
      if(t) t.classList.add('active');
    });
  });
  // 分项模考（整卷 / 单篇单项）
  $('#mkDate').value = todayKey();
  $('#mkGran').addEventListener('change', onMockGran);
  $('#mkType').addEventListener('change', onMockType);
  $('#mkAdd').addEventListener('click', addMock);
  if($('#mkFilter')) $('#mkFilter').addEventListener('change', renderMock);   // 9/13：统计+列表一起跟随范围筛选（原先只刷统计，列表不跟→口径分裂）
  // 9/29 之之：分项记录列表自己的筛选（科目 / 整卷-单篇），只作用于列表，不影响上方统计口径
  if($('#mkListType')) $('#mkListType').addEventListener('change', renderMockList);
  if($('#mkListGran')) $('#mkListGran').addEventListener('change', renderMockList);
  onMockType();
  onMockGran();   // 9/10：默认粒度=单项，初始化时把「选择 Part / 答对题数」摆到可见态
  renderMock();
  render();
});

function overall(l, r, w, s){
  const avg = (Number(l) + Number(r) + Number(w) + Number(s)) / 4;
  return Math.round(avg * 2) / 2;
}

function addScore(){
  const date = $('#scoreDate').value || todayKey();
  const l = $('#scL').value, r = $('#scR').value, w = $('#scW').value, s = $('#scS').value;
  if(l === '' || r === '' || w === '' || s === ''){ toast('四项分数都要填'); return; }
  // 校验范围 0–9 且为 0.5 的整数倍
  const vals = [l, r, w, s];
  for(const v of vals){
    const n = Number(v);
    if(isNaN(n) || n < 0 || n > 9){ toast('分数必须在 0–9 之间'); return; }
    if(Math.abs(n * 2 - Math.round(n * 2)) > 1e-9){ toast('分数须为 0.5 的整数倍（如 5.5、6.0）'); return; }
  }
  // 同日期重复检查
  const existing = DATA.scores.find(x => x.date === date);
  if(existing && !confirm(date + ' 已有记录，是否覆盖？')) return;
  if(existing){
    existing.listening = Number(l);
    existing.reading = Number(r);
    existing.writing = Number(w);
    existing.speaking = Number(s);
    existing.note = $('#scNote').value.trim();
  } else {
    DATA.scores.push({
      id: uid(), date,
      listening: Number(l), reading: Number(r), writing: Number(w), speaking: Number(s),
      note: $('#scNote').value.trim()
    });
  }
  hubSave();
  $('#scL').value = $('#scR').value = $('#scW').value = $('#scS').value = '';
  $('#scNote').value = '';
  render();
  toast('已保存 ' + date + ' 成绩');
}

function deleteScore(id){
  const rec = DATA.scores.find(x => x.id === id);
  if(!rec) return;
  if(!confirm('确定删除 ' + rec.date + ' 的成绩？此操作不可恢复。')) return;
  DATA.scores = DATA.scores.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave(); render();
}

function render(){
  const list = DATA.scores.slice().sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  const t = DATA.settings.targets || {};
  const targetOverall = t.overall || 0;
  const hasTargets = targetOverall > 0;

  /* R-3（10-24）：总览五卡 + 四科对比条 + 行动建议 三块合成一个焦点块。
     统计口径一个都没新写：总分 = overall()、目标 = DATA.settings.targets、
     倒计时 = examCountdown()、已考场次 = list.length —— 全是渲染前就在算的老值，
     只是把结果写到焦点块的大字 / 底部两格 / 结论句里。 */
  const cd = examCountdown();
  const examMd = cd.md || '考试';
  const dLabel = cd.label;
  const latest = list.length ? list[0] : null;
  const latestLo = latest ? overall(latest.listening, latest.reading, latest.writing, latest.speaking) : null;

  /* ---- 焦点块头部 / 大总分 ---- */
  const setTxt = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setTxt('rvFocusLab', list.length ? '最近一次' : '还没有成绩记录');
  setTxt('rvFocusDate', latest ? String(latest.date || '') : '');
  setTxt('rvFocusNum', latestLo != null ? latestLo.toFixed(1) : '--');
  setTxt('rvFocusUnit', '总分 · 目标 ' + (hasTargets ? targetOverall.toFixed(1) : '未设'));
  /* 底部两格：倒计时与已考场次**必须常驻**（她每天最想看的两个数） */
  setTxt('rvFocusCdLab', '距 ' + (examMd || '考试') + ' 还有');
  setTxt('rvFocusCdVal', dLabel);
  setTxt('rvFocusCount', String(list.length));

  /* ---- 兼容容器 #scoreStats：只在空态时承载「还没有成绩」的指路文案 ----
     R-3 之后焦点块自己已经显示总分/目标/倒计时/场次，那五张卡是同一件事第四遍 → 常态不写。
     空态仍沿用原来的 statCard + renderEmpty 组合（CSS 用 :has(.empty) 决定显不显示）。 */
  const statBox = $('#scoreStats');
  if(statBox){
    if(list.length === 0){
      statBox.innerHTML =
        statCard('距 ' + (examMd || '考试') + ' 还有', dLabel, 'var(--warn)') +
        (hasTargets ? statCard('本场目标', targetOverall.toFixed(1), 'var(--med)') : statCard('本场目标', '未设', 'var(--muted)')) +
        '<div style="grid-column:1/-1">' + renderEmpty('还没有成绩记录，考完第一场就来填吧。') + '</div>';
    } else {
      statBox.innerHTML = '';
    }
  }

  // bars (latest vs target) — 改为「差 X 分」对比，差距最大项红色置顶
  const barBox = $('#scoreBars');
  if(list.length === 0){
    // 10/10 批④：空态给指路（原「暂无数据。」纯占位，新用户不知道这页要自己录）
    barBox.innerHTML = renderEmpty('点下面的「添加真题成绩」把一次模考的四科分填进去，这里就会显示各科与目标的差距。');
  } else if(!hasTargets){
    barBox.innerHTML = renderEmpty('还没设目标分数，去「设置 / 目标分数」填一下再对比。');
  } else {
    const x = list[0];
    const mods = [
      { name:'听力', icon:'🎧', color:'var(--mock)', val:x.listening, target:t.listening||0 },
      { name:'阅读', icon:'📖', color:'var(--vocab)', val:x.reading,   target:t.reading||0 },
      { name:'写作', icon:'✏️', color:'var(--warn)',  val:x.writing,   target:t.writing||0 },
      { name:'口语', icon:'🗣', color:'var(--med)',   val:x.speaking,  target:t.speaking||0 },
    ];
    mods.forEach(m => { m.gap = Math.round((m.val - m.target) * 2) / 2; });
    mods.sort((a, b) => a.gap - b.gap);              // gap 最小（最负=差距最大）置顶
    const worstGap = mods[0].gap;
    barBox.innerHTML = mods.map(m => {
      const isWorst = m.gap === worstGap && m.gap < 0;   // 仅当确有短板(负 gap)才标红
      const tag = m.gap < 0 ? '还差 ' + Math.abs(m.gap).toFixed(1) + ' 分'
                : (m.gap > 0 ? '已超 ' + m.gap.toFixed(1) + ' 分' : '已达标');
      const cls = m.gap < 0 ? 'down' : 'up';
      return `<div class="gap-row${isWorst ? ' gap-worst' : ''}">
        <span class="gap-ic" style="color:${m.color}">${m.icon}</span>
        <span class="gap-name">${m.name}</span>
        <span class="gap-val">${m.val} / 目标 ${m.target}</span>
        <span class="badge ${cls} gap-tag">${tag}</span>
      </div>`;
    }).join('');
  }

  // 行动建议（最弱项）—— R-3 起是焦点块底部那一句结论
  const tipBox = $('#actionTip');
  if(tipBox){
    if(list.length === 0 || !hasTargets){
      tipBox.innerHTML = '';
    } else {
      const x = list[0];
      const mods = [
        { name:'听力', val:x.listening, target:t.listening||0 },
        { name:'阅读', val:x.reading,   target:t.reading||0 },
        { name:'写作', val:x.writing,   target:t.writing||0 },
        { name:'口语', val:x.speaking,  target:t.speaking||0 },
      ];
      mods.forEach(m => { m.gap = Math.round((m.val - m.target) * 2) / 2; });
      mods.sort((a, b) => a.gap - b.gap);
      const w = mods[0];
      /* 10-24 她禁 emoji：原来那两句带 💡 / 🎉 → 去掉，只留文字 */
      if(w.gap < 0){
        tipBox.innerHTML = '最弱项 <b>' + w.name + '</b>（差 ' + Math.abs(w.gap).toFixed(1) + ' 分），先补它：'
          + '<a href="practice.html" class="tip-link">去练' + w.name + ' →</a>';
      } else {
        tipBox.innerHTML = '四项均已达目标，保持节奏即可。';
      }
    }
  }

  // list
  const box = $('#scoreList');
  if(list.length === 0){
    box.innerHTML = renderEmpty('还没有成绩记录。点下面「添加真题成绩」录一条，这里会按时间列出每次成绩。');
    /* 🔴 R-4：趋势图必须**在空态也要画**（renderTrend 自己有「还没有模考成绩」的空态文案），
       否则第一次填成绩之前那块永远是白板。原来这里直接 return 会跳过它。 */
    renderTrend();
    return;
  }
  box.innerHTML = list.map(x => {
    const lo = overall(x.listening, x.reading, x.writing, x.speaking);
    const diff = Math.round((lo - targetOverall) * 2) / 2;
    const reached = diff >= 0;
    return `<div class="score-row">
      <strong style="min-width:96px">${x.date}</strong>
      <span class="badge l">听 ${x.listening}</span>
      <span class="badge r">读 ${x.reading}</span>
      <span class="badge w">写 ${x.writing}</span>
      <span class="badge s">口 ${x.speaking}</span>
      <span class="badge overall">总分 ${lo.toFixed(1)}</span>
      <span class="badge ${reached ? 'up' : 'down'}">${reached ? '已达标' : '还差 ' + Math.abs(diff).toFixed(1) + ' 分'}</span>
      ${x.note ? `<span class="muted">${escapeHtml(x.note)}</span>` : ''}
      <button class="plan-del" data-del="${x.id}" title="删除" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-del]').forEach(b =>
    b.addEventListener('click', () => deleteScore(b.dataset.del)));

  /* 🔴 R-4（10-24）：把 renderTrend 接上 —— 这个函数从上线至今一次都没被调用过
     （全站没有 #trendChart 容器，它第一行就 return 了）。本批补容器 + 在这里调用，
     删除/新增成绩后也会跟着重画，不是只在首次渲染时画一次。 */
  renderTrend();
}

/* ===== 成绩趋势折线图（SVG） ===== */
function renderTrend(){
  const box = $('#trendChart'); if(!box) return;
  const list = DATA.scores.slice().sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  if(list.length === 0){
    box.innerHTML = renderEmpty('还没有模考成绩，考完第一场就来填吧。');
    return;
  }
  if(list.length === 1){
    // 单点：画「当前 vs 目标」对比 + 推进文案（不再只占位）
    const t = DATA.settings.targets || {};
    const s = list[0];
    const W = 660, H = 300, padL = 34, padR = 16, padT = 16, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const Y = v => padT + plotH * (1 - Math.max(0, Math.min(9, v)) / 9);
    const X = padL + plotW / 2;
    const series = [
      { key:'listening', name:'听力', color:'var(--mock)', target:t.listening||5.5 },
      { key:'reading',   name:'阅读', color:'var(--vocab)', target:t.reading||6.5 },
      { key:'writing',   name:'写作', color:'var(--warn)',  target:t.writing||5.5 },
      { key:'speaking',   name:'口语', color:'var(--med)',   target:t.speaking||5.5 },
    ];
    let grid = '';
    for(let g = 0; g <= 9; g++){ const gy = Y(g); grid += `<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" style="stroke:var(--line)" stroke-width="1"/>`; grid += `<text x="${padL-6}" y="${gy+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${g}</text>`; }
    let body = '';
    series.forEach(se => {
      const v = s[se.key], cy = Y(v), ty = Y(se.target);
      body += `<line x1="${padL}" y1="${ty}" x2="${W-padR}" y2="${ty}" stroke="${se.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".6"/>`;
      body += `<circle cx="${X}" cy="${cy}" r="6" style="fill:${se.color}"/>`;
      body += `<text x="${X+12}" y="${cy+4}" font-size="12" style="fill:var(--ink);font-weight:700">${se.name} ${v}</text>`;
      body += `<text x="${W-padR}" y="${ty-4}" text-anchor="end" font-size="10" style="fill:${se.color}">目标 ${se.target}</text>`;
    });
    box.innerHTML = `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:520px">${grid}${body}</svg></div>`
      + `<div class="rv-trend-note">只有 1 次模考，先画出「当前 vs 目标」。再考 1 次就能看到完整趋势。</div>`;
    return;
  }
  /* 🔴 R-REC-2（10-25）：按场次分档。她原话「成绩趋势就三次考试要弄这么大一个折线
     我感觉是不是没必要」—— 3 个点看不出趋势，只看得出大小，折线是噪音不是信息。
       0 场 → 空态（上面已 return）   1 场 → 四行大字（上面已 return）
       2~3 场 → 场次横条 + 目标对比   4~7 场 → 紧凑折线   8 场及以上 → 完整大折线
     分档按 list.length 自动切，她不用手动选。数据结构 / #trendChart / DATA.scores 一行不动。 */
  const SERIES = [
    { key:'listening', name:'听力', short:'听', color:'var(--mock)',   target:5.5 },
    { key:'reading',   name:'阅读', short:'读', color:'var(--vocab)',  target:6.5 },
    { key:'writing',   name:'写作', short:'写', color:'var(--warn)',   target:5.5 },
    { key:'speaking',  name:'口语', short:'口', color:'var(--med)',    target:5.5 },
  ];
  const tg = DATA.settings.targets || {};
  const tgtOf = se => Number(tg[se.key] != null ? tg[se.key] : se.target) || se.target;
  /* 分数 0~9 → 条长百分比（与折线的 Y 同一条映射，两处读出来的「高低」必须对得上） */
  const pctOf = v => Math.max(0, Math.min(100, Math.max(0, Math.min(9, Number(v) || 0)) / 9 * 100));

  /* ── 2~3 场：场次横条 + 目标对比（不画折线）── */
  if(list.length <= 3){
    const cards = list.map((s, i) => {
      const isLast = (i === list.length - 1);
      const rows = SERIES.map(se => {
        const v = s[se.key];
        return '<div class="rt-r"><i style="background:' + se.color + '"></i>'
          + '<span class="rt-nm">' + se.short + '</span>'
          + '<span class="rt-bar"><i style="width:' + pctOf(v) + '%;background:' + se.color + '"></i></span>'
          + '<b>' + v + '</b></div>';
      }).join('');
      return '<div class="rt-st' + (isLast ? ' rt-cur' : '') + '">'
        + '<div class="rt-d">' + String(s.date || '').slice(5) + '</div>'
        + '<div class="rt-lb">第 ' + (i + 1) + ' 场' + (isLast ? ' · 最新' : '') + '</div>'
        + '<div class="rt-rows">' + rows + '</div></div>';
    }).join('<span class="rt-arrow">›</span>');

    /* 目标对比：条 = 当前分，黑竖线 = 目标分位置，右侧写差多少 */
    const latest = list[list.length - 1];
    const trows = SERIES.map(se => {
      const cur = Number(latest[se.key]) || 0, goal = tgtOf(se);
      const ok = cur >= goal;
      const gap = ok
        ? (cur > goal ? '已超过' : '已达标')
        : ('还差 ' + (Math.round((goal - cur) * 2) / 2).toFixed(1));
      return '<div class="rt-tg"><span class="rt-nm">' + se.name + '</span>'
        + '<span class="rt-bar"><i class="rt-fill" style="width:' + pctOf(cur) + '%;background:' + se.color + '"></i>'
        + '<i class="rt-tick" style="left:' + pctOf(goal) + '%"></i></span>'
        + '<span class="rt-val">' + latest[se.key] + '</span>'
        + '<span class="rt-gap" style="color:' + (ok ? 'var(--ok)' : 'var(--warn)') + '">' + gap + '</span></div>';
    }).join('');

    box.innerHTML = '<div class="rt-streak">' + cards + '</div>'
      + '<div class="rt-tgt">' + trows + '</div>'
      + '<div class="rv-trend-note">黑竖线是目标分。条是当前分，线在条右边 = 还没到，线在条左边 = 已超过。</div>';
    return;
  }

  /* ── 4 场及以上：折线。4~7 场用紧凑版（矮一半、网格只留 4/6/8 三条、去掉数字）── */
  const compact = list.length <= 7;
  const W = 660, H = compact ? 180 : 300, padL = 34, padR = 16, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const X = i => padL + (list.length === 1 ? plotW/2 : plotW * i / (list.length - 1));
  const Y = v => padT + plotH * (1 - Math.max(0, Math.min(9, v)) / 9);
  const series = [
    { key:'listening', name:'听力', color:'var(--mock)' },
    { key:'reading',   name:'阅读', color:'var(--vocab)' },
    { key:'writing',   name:'写作', color:'var(--warn)' },
    { key:'speaking',  name:'口语', color:'var(--med)' },
  ];
  let grid = '';
  /* 网格：紧凑版只画 4/6/8 三条且不带数字（矮图里 10 条线是纯噪音）；完整版维持 0~9 带数字 */
  const gridVals = compact ? [4, 6, 8] : [0,1,2,3,4,5,6,7,8,9];
  for(const g of gridVals){
    const gy = Y(g);
    grid += `<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" style="stroke:var(--line)" stroke-width="1"/>`;
    if(!compact) grid += `<text x="${padL-6}" y="${gy+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${g}</text>`;
  }
  let xlabels = '';
  list.forEach((s, i) => { xlabels += `<text x="${X(i)}" y="${H-padB+16}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${s.date.slice(5)}</text>`; });
  let paths = '';
  series.forEach(se => {
    const pts = list.map((s,i) => X(i) + ',' + Y(s[se.key]));
    paths += `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${se.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    list.forEach((s,i) => { paths += `<circle cx="${X(i)}" cy="${Y(s[se.key])}" r="3" style="fill:${se.color}"/>`; });
  });
  const legend = series.map(se => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:12px"><span style="width:11px;height:11px;border-radius:3px;background:${se.color}"></span>${se.name}</span>`).join('');
  box.innerHTML = `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:520px">${grid}${paths}${xlabels}</svg></div><div style="margin-top:8px">${legend}</div>`;
  if(compact) box.innerHTML += `<div class="rv-trend-note">已经有 ${list.length} 场成绩，这里能看出走向了。</div>`;
}

/* ===== 综合掌握度雷达图（SVG，最新 vs 目标） ===== */
function renderRadar(){
  const box = $('#radarChart'); if(!box) return;
  const list = DATA.scores.slice().sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  if(list.length === 0){ box.innerHTML = renderEmpty('至少需要 1 次模考成绩，才能绘制掌握度雷达图。'); return; }
  const t = DATA.settings.targets || {};
  const latest = list[0];
  const axes = [
    { name:'听力', val: latest.listening, target: t.listening||5.5 },
    { name:'阅读', val: latest.reading,   target: t.reading||6.5 },
    { name:'写作', val: latest.writing,   target: t.writing||5.5 },
    { name:'口语', val: latest.speaking,  target: t.speaking||5.5 },
  ];
  const W = 320, H = 320, cx = 160, cy = 160, R = 110, n = axes.length;
  const ang = i => -Math.PI/2 + i * 2 * Math.PI / n;
  const pt = (i, val) => { const r = R * Math.max(0, Math.min(9, val)) / 9; return [cx + r*Math.cos(ang(i)), cy + r*Math.sin(ang(i))]; };
  let rings = '';
  for(let g = 1; g <= 3; g++){
    const rr = R * g / 3;
    const p = axes.map((_, i) => { const a = ang(i); return (cx + rr*Math.cos(a)) + ',' + (cy + rr*Math.sin(a)); }).join(' ');
    rings += `<polygon points="${p}" fill="none" style="stroke:var(--line)" stroke-width="1"/>`;
  }
  let axisSvg = '';
  axes.forEach((ax, i) => {
    const a = ang(i), ex = cx + R*Math.cos(a), ey = cy + R*Math.sin(a);
    axisSvg += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" style="stroke:var(--line)" stroke-width="1"/>`;
    const lx = cx + (R+18)*Math.cos(a), ly = cy + (R+18)*Math.sin(a);
    axisSvg += `<text x="${lx}" y="${ly+4}" text-anchor="middle" font-size="12" style="fill:var(--ink);font-weight:600">${ax.name}</text>`;
  });
  const tpts = axes.map((ax,i) => pt(i, ax.target).join(',')).join(' ');
  const lpts = axes.map((ax,i) => pt(i, ax.val).join(',')).join(' ');
  let valLab = '';
  axes.forEach((ax,i) => { const [px,py] = pt(i, ax.val); valLab += `<text x="${px}" y="${py-6}" text-anchor="middle" font-size="11" style="fill:var(--primary);font-weight:700">${ax.val}</text>`; });
  box.innerHTML = `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
    <svg viewBox="0 0 ${W} ${H}" width="300" height="300" style="flex:none">${rings}${axisSvg}
      <polygon points="${tpts}" fill="none" style="stroke:var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>
      <polygon points="${lpts}" fill="var(--primary-soft)" style="stroke:var(--primary)" stroke-width="2.5"/>${valLab}
    </svg>
    <div style="font-size:13px;line-height:2.2">
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--primary);margin-right:6px;vertical-align:middle"></span>最新一次（${latest.date}）</div>
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:2px dashed var(--muted);margin-right:6px;vertical-align:middle"></span>目标分数</div>
    </div>
  </div>`;
  if(list.length === 1){
    box.innerHTML += `<div style="margin-top:8px;font-size:13px;color:var(--muted)">🧭 已画出当前 vs 目标雷达，再考 1 次可看能力变化～</div>`;
  }
}

/* ===== 分项模考正确率（整卷 / 单篇单项） ===== */
function onMockType(){
  const cfg = MOCK_TYPES[$('#mkType').value];
  $('#mkPart').innerHTML = cfg.parts.map(p => `<option value="${p.label}">${p.label}</option>`).join('');
  if($('#mkGran').value === 'whole') renderPartInputs();
  else renderSinglePartInput();
}
function onMockGran(){
  const whole = $('#mkGran').value === 'whole';
  /* 9/10：五控件并入同一行后，单项模式的两个格子各自带 id，切整卷时一起藏 */
  $('#mkPartPick').hidden = whole;
  $('#mkPartInputWrap').hidden = whole;
  $('#mkParts').hidden = !whole;
  if(whole) renderPartInputs();
  else renderSinglePartInput();
}
function renderSinglePartInput(){
  const cfg = MOCK_TYPES[$('#mkType').value];
  const isScore = cfg.mode === 'score';
  $('#mkPartInputLabel').textContent = isScore ? '得分（0–9，可 .5）' : '答对题数';
  const inp = $('#mkPartInput');
  inp.type = 'number';
  inp.min = '0';
  inp.placeholder = isScore ? '0–9' : '0';
  if(isScore){
    inp.step = '0.5';
    inp.max = '9';
  } else {
    inp.removeAttribute('step');
    inp.removeAttribute('max');
  }
}
function renderPartInputs(){
  const cfg = MOCK_TYPES[$('#mkType').value];
  const isScore = cfg.mode === 'score';
  $('#mkParts').className = isScore ? 'mk-parts mk-parts-grid' : 'mk-parts mk-parts-inline';
  $('#mkParts').innerHTML = cfg.parts.map(p => {
    const label = p.label;
    const def = cfg.parts.find(x => x.label === label) || {};
    if(isScore){
      return `<div class="mk-part mk-part-grid">
        <div class="mk-part-label">${label}</div>
        <div class="mk-part-inputs">
          <div><label>得分（0–9，可 .5）</label><input type="number" step="0.5" min="0" max="9" class="mk-score" data-part="${label}" placeholder="选填" /></div>
        </div>
      </div>`;
    }
    return `<div class="mk-part mk-part-inline">
      <span class="mk-part-label">${label}</span>
      <input type="number" min="0" class="mk-correct" data-part="${label}" placeholder="0" />
      <input type="hidden" class="mk-total" data-part="${label}" value="${def.defaultTotal || ''}" />
    </div>`;
  }).join('');
}

function addMock(){
  const type = $('#mkType').value;
  const cfg = MOCK_TYPES[type];
  const gran = $('#mkGran').value;
  const date = $('#mkDate').value || todayKey();
  const isScore = cfg.mode === 'score';
  const parts = [];
  let bad = false;
  if(gran === 'part'){
    const label = $('#mkPart').value;
    const v = ($('#mkPartInput').value || '').trim();
    if(v === ''){ toast('请填写' + (isScore ? '得分' : '答对题数')); return; }
    if(isScore){
      const num = Number(v);
      if(!(num >= 0) || num > 9 || Math.abs(num * 2 - Math.round(num * 2)) > 1e-9){
        toast('得分必须在 0–9 之间且为 0.5 的整数倍'); return;
      }
      parts.push({ label, score: num });
    } else {
      const def = cfg.parts.find(p => p.label === label) || {};
      const tv = Number(def.defaultTotal || 0);
      if(!(tv > 0)){ toast('该 Part 无默认总题数'); return; }
      const cv = Number(v);
      if(!(cv >= 0) || cv > tv){ toast('答对必须是 0~' + tv + ' 之间（' + label + '）'); return; }
      parts.push({ label, correct: cv, total: tv });
    }
  } else {
    document.querySelectorAll('#mkParts .mk-part').forEach(row => {
      const label = row.querySelector('.mk-correct, .mk-score').dataset.part;
      if(isScore){
        const sv = (row.querySelector('.mk-score').value || '').trim();
        if(sv === '') return;
        const v = Number(sv);
        if(!(v >= 0) || v > 9){ toast('得分必须在 0–9 之间（' + label + '）'); bad = true; return; }
        parts.push({ label, score: v });
      } else {
        const c = (row.querySelector('.mk-correct').value || '').trim();
        const t = (row.querySelector('.mk-total').value || '').trim();
        // ⚠️ 只填了总题数(预填默认值)但没填答对的 part，必须跳过——否则会被当成「答对0/总题数」存成全零假记录
        if(c === '') return;
        const cv = Number(c), tv = Number(t);
        if(!(tv > 0)){ toast('总题数必须大于 0（' + label + '）'); bad = true; return; }
        if(!(cv >= 0) || cv > tv){ toast('答对必须是 0~总题数 之间（' + label + '）'); bad = true; return; }
        parts.push({ label, correct: cv, total: tv });
      }
    });
  }
  if(bad) return;
  if(parts.length === 0){ toast('至少填一个 part 的' + (isScore ? '得分' : '答对 / 总题数')); return; }
  DATA.mockRecords.unshift({ id:uid(), date, granularity:gran, type, parts });
  hubSave();
  if(gran === 'whole') renderPartInputs();
  else $('#mkPartInput').value = '';
  renderMock();
  // 整卷 + 客观题：顺带估算卷面雅思分
  let msg = '已保存分项模考';
  if(gran === 'whole' && !isScore){
    const tc = parts.reduce((s,p) => s + p.correct, 0);
    const tt = parts.reduce((s,p) => s + p.total, 0);
    const band = estimateBand(type, tc, tt);
    if(band != null) msg += '（' + cfg.name + '整卷约 ' + band.toFixed(1) + ' 分）';
    // 9/15 距目标反馈：目标对个数由设置页目标分推导（听力 5.5→21，阅读 6.5→28）
    const n = targetCorrectFor(type, (DATA.settings.targets || {})[type]);
    if(n != null){
      if(tc >= n) msg += '，已达' + cfg.name + '目标 ' + n + ' 个 ✓';
      else msg += '，距' + cfg.name + '目标 ' + n + ' 个还差 ' + (n - tc) + ' 个';
    }
  }
  toast(msg);
}

/* partIsScore / partWeight / estimateBand 已挪至 common.js（10/1） */

/* 从口语页日常练习记录聚合四维度均分。
   评分机制关闭后新记录可能无 score，但只要旧记录/评分恢复后仍有 score，就可用。
   返回 { sum, wsum } 对象，标签与 MOCK_TYPES.speaking.parts 一致。 */
function aggregateSpeakingPracticeScores(cutoffTs){
  const byPart = {};
  let totalSum = 0, totalW = 0;
  (DATA.speaking || []).forEach(s => {
    if(!s || !s.answers) return;
    const allAns = Object.values(s.answers);
    allAns.forEach(a => {
      (a && a.records || []).forEach(r => {
        if(!r || !r.score) return;
        if(cutoffTs && r.ts && r.ts < cutoffTs) return;   // 近十天：无 ts 的旧数据不带日期，无法归属窗口，保留
        const map = [
          { k:'fluency',      l:'流利度 Fluency', w:1 },
          { k:'vocabulary',   l:'词汇 Lexical',   w:1 },
          { k:'grammar',      l:'语法 Grammar',    w:1 },
          { k:'pronunciation',l:'发音 Pronunciation', w:1 }
        ];
        map.forEach(m => {
          const v = parseFloat(r.score[m.k]);
          if(isNaN(v)) return;
          const p = byPart[m.l] || (byPart[m.l] = { sum:0, wsum:0 });
          p.sum += v; p.wsum += 1;
          totalSum += v; totalW += 1;
        });
      });
      // 兼容老数据：a.score 直接挂在答案上（非 records 数组）
      if(a.score && !Array.isArray(a.records)){
        const map = [
          { k:'fluency',      l:'流利度 Fluency', w:1 },
          { k:'vocabulary',   l:'词汇 Lexical',   w:1 },
          { k:'grammar',      l:'语法 Grammar',    w:1 },
          { k:'pronunciation',l:'发音 Pronunciation', w:1 }
        ];
        map.forEach(m => {
          const v = parseFloat(a.score[m.k]);
          if(isNaN(v)) return;
          const p = byPart[m.l] || (byPart[m.l] = { sum:0, wsum:0 });
          p.sum += v; p.wsum += 1;
          totalSum += v; totalW += 1;
        });
      }
    });
  });
  return { byPart, overall: totalW ? { sum: totalSum, wsum: totalW } : null };
}

/* 判定是否为口语整卷模考记录 → 已挪至 common.js（10/1，isSpeakingMockRec） */

/* 把一条口语整卷模考记录聚合成「分项模考」所需的四维结构。
   新版：parts.p1/p2/p3 含 {fc,lr,gra,overall}，发音取 pronunciationScore
   旧版：dims 含 {fluency,lexical,grammar,pronunciation}
   返回 { byPart, overall }；overall 用记录总 Band，四维用于下面的进度条。 */
function aggregateSpeakingMockRecord(r){
  const byPart = {};
  let dimSum = 0, dimW = 0;

  // 新版结构
  if(r.parts && typeof r.parts === 'object' && !Array.isArray(r.parts)){
    ['p1','p2','p3'].forEach(k => {
      const p = r.parts[k];
      if(!p) return;
      const map = [
        { k:'fc',  l:'流利度 Fluency' },
        { k:'lr',  l:'词汇 Lexical' },
        { k:'gra', l:'语法 Grammar' }
      ];
      map.forEach(m => {
        const v = parseFloat(p[m.k]);
        if(isNaN(v)) return;
        const pa = byPart[m.l] || (byPart[m.l] = { sum:0, wsum:0 });
        pa.sum += v; pa.wsum += 1;
        dimSum += v; dimW += 1;
      });
    });
    const pron = parseFloat(r.pronunciationScore);
    if(!isNaN(pron)){
      const pa = byPart['发音 Pronunciation'] || (byPart['发音 Pronunciation'] = { sum:0, wsum:0 });
      pa.sum += pron; pa.wsum += 1;
      dimSum += pron; dimW += 1;
    }
  }

  // 旧版结构
  if(r.dims && typeof r.dims === 'object'){
    const map = [
      { k:'fluency',     l:'流利度 Fluency' },
      { k:'lexical',     l:'词汇 Lexical' },
      { k:'grammar',     l:'语法 Grammar' },
      { k:'pronunciation', l:'发音 Pronunciation' }
    ];
    map.forEach(m => {
      const v = parseFloat(r.dims[m.k]);
      if(isNaN(v)) return;
      const pa = byPart[m.l] || (byPart[m.l] = { sum:0, wsum:0 });
      pa.sum += v; pa.wsum += 1;
      dimSum += v; dimW += 1;
    });
  }

  const overall = parseFloat(r.overall);
  if(isNaN(overall)) return null;
  return { byPart, overall: { sum: overall, wsum: 1 } };
}

/* 近十天窗口下界（之之 9/10：范围筛选改为 全部/近十天）。
   含今天共 10 个自然日；本地日期帧拼回，禁止 toISOString（UTC+8 会回退一天）。 */
function mkRecentCutoff(){
  const d = new Date();
  d.setDate(d.getDate() - 9);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function mkRecentCutoffTs(){
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - 9 * 86400000;
}

/* 10/17 #9 层次 3：按题型看正确率。
   数据来源 = 做题页（js/bank.js）交卷时落盘的 mockRecords[].detail[].t（题型短代码）。
   🔴 三条口径必须记住：
   ① 只统计「做题页真实作答」的逐题明细 —— 回顾页手动录入的记录没有 detail，天然不进这块；
   ② 题型代码来自 bank.js 的 qtypeCode()，与做题页渲染分支同源
      （她 10/15 纠正过「段落匹配 ≠ Heading 题」，两边口径必须一致，否则统计与卷面自相矛盾）；
   ③ detail 是 10/16 才开始存的、题型字段是 10/17 才开始存的 →
      历史记录没有它，这里必须**跳过而不是显示 0%**（0% 会被读成「全错」= 错误陈述）。 */

/* 按题型汇总（与 mockAggregate 同用「全部 / 近十天」口径） */
function qtypeAggregate(range){
  const agg = {};
  const cutoff = range === 'recent' ? mkRecentCutoff() : '';
  DATA.mockRecords.forEach(r => {
    if(cutoff && String(r.date || '') < cutoff) return;
    const det = Array.isArray(r.detail) ? r.detail : null;
    if(!det) return;
    det.forEach(d => {
      const code = (d && d.t) ? String(d.t) : '';
      if(!code) return;                       /* 老记录没有题型字段 → 跳过，不报错也不计 0 */
      const a = agg[code] || (agg[code] = { c: 0, t: 0 });
      a.t++; if(d.ok) a.c++;
    });
  });
  return agg;
}

function renderQtypeStats(){
  const box = $('#mkQtStats'); if(!box) return;
  const range = $('#mkFilter') ? $('#mkFilter').value : 'all';
  const agg = qtypeAggregate(range);
  const codes = Object.keys(agg).filter(c => agg[c].t > 0);
  if(!codes.length){
    box.innerHTML = renderEmpty('还没有可统计的做题明细。在做题页交卷后，这里会按题型算正确率（手动录入的记录没有逐题信息，不计入）。');
    return;
  }
  codes.sort((a, b) => (agg[a].c / agg[a].t) - (agg[b].c / agg[b].t));   /* 正确率低 → 高，最弱排最上 */
  const total = codes.reduce((s, c) => s + agg[c].t, 0);
  const worst = codes[0], wcfg = QTYPE_LABELS[worst] || { name: worst };
  box.innerHTML = codes.map(c => {
    const a = agg[c], cfg = QTYPE_LABELS[c] || { name: c, color: 'var(--primary)' };
    return progressBar(cfg.name + '　' + a.c + '/' + a.t, a.c / a.t * 100, cfg.color);
  }).join('')
    + '<p class="mk-qt-note">共 ' + total + ' 道题（只算做题页真实作答；手动录入的记录没有逐题信息）。'
    + '正确率最低的是 <b>' + escapeHtml(wcfg.name) + '</b>（' + agg[worst].c + '/' + agg[worst].t
    + '，' + Math.round(agg[worst].c / agg[worst].t * 100) + '%），建议优先练它。</p>';
}

function mockAggregate(range){
  const byType = {}, byPart = {};
  const recent = range === 'recent';
  const cutoff = recent ? mkRecentCutoff() : '';
  const cutoffTs = recent ? mkRecentCutoffTs() : 0;

  DATA.mockRecords.forEach(r => {
    if(recent && String(r.date || '') < cutoff) return;   // 近十天：'YYYY-MM-DD' 字典序即时间序

    // ① 口语整卷模考记录 → 联动到「分项模考」口语统计
    if(isSpeakingMockRec(r)){
      const sp = aggregateSpeakingMockRecord(r);
      if(!sp) return;
      const ta = byType.speaking || (byType.speaking = { c:0, t:0, sum:0, wsum:0 });
      ta.sum += sp.overall.sum; ta.wsum += sp.overall.wsum;
      Object.entries(sp.byPart).forEach(([label, p]) => {
        const key = 'speaking|' + label;
        const pa = byPart[key] || (byPart[key] = { c:0, t:0, sum:0, wsum:0 });
        pa.sum += p.sum; pa.wsum += p.wsum;
      });
      return;
    }

    // ② 普通分项模考记录（听/读/写/口语分项）
    if(!Array.isArray(r.parts)) return;
    const cfg = MOCK_TYPES[r.type];
    if(!cfg) return;
    const ta = byType[r.type] || (byType[r.type] = { c:0, t:0, sum:0, wsum:0 });
    r.parts.forEach(p => {
      if(partIsScore(p)){
        const w = partWeight(cfg, p.label);
        ta.sum += p.score * w; ta.wsum += w;   // ⚠️ 分子必须乘权重，否则 Task2(权重2) 被稀释→写作均分虚低(如 5.5→3.7)
        const pa = byPart[r.type + '|' + p.label] || (byPart[r.type + '|' + p.label] = { c:0, t:0, sum:0, wsum:0 });
        pa.sum += p.score * w; pa.wsum += w;
      } else if(typeof p.correct === 'number' && typeof p.total === 'number'){
        ta.c += p.correct; ta.t += p.total;
        const pa = byPart[r.type + '|' + p.label] || (byPart[r.type + '|' + p.label] = { c:0, t:0, sum:0, wsum:0 });
        pa.c += p.correct; pa.t += p.total;
      }
    });
  });

  // ③ 口语既没有整卷模考、也没有分项模考 → 回退到口语页日常练习评分
  const speakingHasMock = byType.speaking && byType.speaking.wsum > 0;
  if(!speakingHasMock){
    const sp = aggregateSpeakingPracticeScores(cutoffTs);   // 近十天下传：日常练习评分同样只算窗口内
    if(sp.overall){
      byType.speaking = byType.speaking || { c:0, t:0, sum:0, wsum:0 };
      byType.speaking.sum += sp.overall.sum;
      byType.speaking.wsum += sp.overall.wsum;
      Object.entries(sp.byPart).forEach(([label, p]) => {
        const key = 'speaking|' + label;
        const pa = byPart[key] || (byPart[key] = { c:0, t:0, sum:0, wsum:0 });
        pa.sum += p.sum; pa.wsum += p.wsum;
      });
    }
  }

  return { byType, byPart };
}

function renderMockStats(){
  const range = $('#mkFilter') ? $('#mkFilter').value : 'all';   // 'all' | 'recent'（9/10 起不再按粒度筛）
  const { byType, byPart } = mockAggregate(range);
  const keys = Object.keys(MOCK_TYPES);
  const hasAny = DATA.mockRecords.length > 0 || (aggregateSpeakingPracticeScores().overall != null);
  const hasData = keys.some(k => byType[k] && (byType[k].wsum > 0 || byType[k].t > 0));
  const tbox = $('#mkTypeStats');
  if(!hasAny){
    tbox.innerHTML = renderEmpty('还没有分项模考记录。用上面的「添加分项记录」录一条（选科目、Part、答对题数），这里就能看题型正确率。');
  } else if(range === 'recent' && !hasData){
    tbox.innerHTML = renderEmpty('近十天还没有模考记录。');
  } else {
    /* 9/13 修「格式变来变去」：卡片标题此前随数据状态换文案（「🎧 听力 · 22/40」↔「🎧 听力（暂无）」↔「🗣 口语 均分」），
       每次重排卡片宽窄都在跳。现在标题恒为「图标+科目」，数值位统一 有数据=数字 / 无数据=—，
       明细（c/t、均分）由下方「各 Part 表现」承担。 */
    tbox.innerHTML = '<div class="stat-grid">' + keys.map(ty => {
      const cfg = MOCK_TYPES[ty], a = byType[ty];
      if(cfg.mode === 'score'){
        const has = a && a.wsum > 0;
        return statCard(cfg.icon + ' ' + cfg.name, has ? (a.sum / a.wsum).toFixed(1) : '—', has ? cfg.color : 'var(--muted)');
      }
      const has = a && a.t > 0;
      return statCard(cfg.icon + ' ' + cfg.name, has ? Math.round(a.c / a.t * 100) + '%' : '—', has ? cfg.color : 'var(--muted)');
    }).join('') + '</div>';
  }
  const pbox = $('#mkPartStats');
  if(!hasAny || (range === 'recent' && !hasData)){
    // 10/10 批④：空态给指路（原「暂无数据。」）
    pbox.innerHTML = renderEmpty('还没有分项模考记录。用上面的「添加分项记录」录一条（选科目、Part、答对题数），各 Part 表现就出来了。');
  } else {
    pbox.innerHTML = keys.map(ty => {
      const cfg = MOCK_TYPES[ty];
      const modeTag = cfg.mode === 'score' ? '（各任务均分）' : '（正确率）';
      /* 9/15 之之：没数据的 Part 行直接不渲染——满屏「（暂无）0%」让她以为统计坏了；
         只显示有数据的科目组/行（与列表同口径，数据为空 ≠ 坏）。 */
      const rows = cfg.parts.map(p => {
        const a = byPart[ty + '|' + p.label];
        if(cfg.mode === 'score'){
          if(!a || a.wsum === 0) return '';
          const avg = a.sum / a.wsum;
          return progressBar(cfg.icon + ' ' + p.label + '　' + avg.toFixed(1), avg / 9 * 100, cfg.color);
        }
        if(!a || a.t === 0) return '';
        const pct = a.c / a.t * 100;
        return progressBar(cfg.icon + ' ' + p.label + '　' + a.c + '/' + a.t, pct, cfg.color);
      }).filter(Boolean).join('');
      return rows ? '<div class="mk-grp"><div class="mk-grp-title">' + cfg.icon + ' ' + cfg.name + ' ' + modeTag + '</div>' + rows + '</div>' : '';
    }).filter(Boolean).join('') || renderEmpty('已录科目之外的 Part 还没有数据。');
  }
  renderQtypeStats();   /* 10/17 #9 层次 3：题型的正确率统计（跟随同一个范围筛选） */
}

/* 10/17 #9 层次 2：把秒格式化成 M:SS（用时展示）。只在本页用，不占全局命名。 */
function fmtUsedSec(sec){
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* 10/17 #9 层次 2：逐题明细展开块。
   数据来自 bank.js doSubmit() 落盘的 mockRecords[].detail[]（{qn,user,right,ok}）。
   🔴 在此之前逐题明细只活在内存里 —— 刷新就丢，所以历史上的记录没有 detail，
   这里必须容忍缺失（没 detail 就不渲染这个入口，不是报错）。 */
function mkDetailHtml(r){
  const det = Array.isArray(r.detail) ? r.detail : null;
  if(!det || !det.length) return '';
  const wrong = det.filter(d => !d.ok).length;
  const chips = det.map(d => d.ok
    ? `<span class="mk-dq ok" title="答对"><b>${escapeHtml(d.qn)}</b></span>`
    : `<span class="mk-dq no" title="答错"><b>${escapeHtml(d.qn)}</b><i>${escapeHtml(d.right || '—')}</i><em>${escapeHtml(d.user || '—')}</em></span>`
  ).join('');
  const head = (r.usedSec ? `用时 ${fmtUsedSec(r.usedSec)} · ` : '') + `逐题明细（${det.length} 题，错 ${wrong}）`;
  return `<button type="button" class="mk-det-btn" data-det="${r.id}" aria-expanded="false">详情</button>`
    + `<div class="mk-det" hidden>`
    +   `<div class="mk-det-head">${head}</div>`
    +   `<div class="mk-det-grid">${chips}</div>`
    +   `<div class="mk-det-legend"><span class="lg ok"></span>答对<span class="lg no"></span>答错 · 灰底数字=正确答案，红字=你的答案</div>`
    + `</div>`;
}

function renderMockList(){
  const box = $('#mkList');
  /* 9/13 修口径分裂：范围筛选（全部/近十天）此前只作用于上面的「表现统计」，
     列表却永远显示全部——表现为「上面暂无、下面却有记录」，切筛选时模块看起来时有时无。
     现在列表与统计同用 mkFilter 口径（'YYYY-MM-DD' 字典序即时间序，与 mockAggregate 一致）。 */
  const range = $('#mkFilter') ? $('#mkFilter').value : 'all';
  const cutoff = range === 'recent' ? mkRecentCutoff() : '';
  let partRecs = DATA.mockRecords.filter(r => Array.isArray(r.parts)); // 仅展示分项记录；口语整卷模考走专属 tab
  if(cutoff) partRecs = partRecs.filter(r => String(r.date || '') >= cutoff);
  /* 9/29 之之：列表自己的筛选——科目（听/读/口/写）+ 粒度（整卷 whole / 单篇 part）。
     粒度字段四科都有（录入表单本就分整卷/单篇），所以筛子通用，不用按科目禁用。 */
  const fType = $('#mkListType') ? $('#mkListType').value : 'all';
  const fGran = $('#mkListGran') ? $('#mkListGran').value : 'all';
  const _filtered = fType !== 'all' || fGran !== 'all';
  if(fType !== 'all') partRecs = partRecs.filter(r => r.type === fType);
  if(fGran !== 'all') partRecs = partRecs.filter(r => (r.granularity || 'part') === fGran);
  if(partRecs.length === 0){
    box.innerHTML = renderEmpty(_filtered ? '该筛选条件下暂无记录。换个科目或粒度试试。'
      : (range === 'recent' ? '近十天没有分项模考记录（上方统计同口径）。' : '还没有分项记录。用上面的「添加分项记录」录一条，这里就会按时间列出来。'));
    return;
  }
  const list = partRecs.slice().sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).filter(r => MOCK_TYPES[r.type]);   // 缺日期/未知 type 的旧记录防崩（与 mockAggregate 口径一致）
  box.innerHTML = list.map(r => {
    const cfg = MOCK_TYPES[r.type];
    const hasScore = r.parts.some(partIsScore);
    let overallBadge;
    if(hasScore){
      const sum = r.parts.filter(partIsScore).reduce((s,p) => s + p.score * partWeight(cfg, p.label), 0);
      const wsum = r.parts.filter(partIsScore).reduce((s,p) => s + partWeight(cfg, p.label), 0);
      const avg = wsum ? sum / wsum : 0;
      overallBadge = `<span class="badge overall">均分 ${avg.toFixed(1)}</span>`;
    } else {
      const tc = r.parts.reduce((s,p) => s + (p.correct||0), 0);
      const tt = r.parts.reduce((s,p) => s + (p.total||0), 0);
      const pct = tt ? Math.round(tc/tt*100) : 0;
      overallBadge = `<span class="badge overall">${pct}%</span>`;
    }
    const partsHtml = r.parts.map(p => partIsScore(p)
      ? `<span class="badge">${p.label} · ${p.score}</span>`
      : `<span class="badge">${p.label} ${p.correct||0}/${p.total||0}</span>`).join(' ');
    // 整卷客观题：顺带估算卷面分 + 距目标反馈（目标对个数由设置页目标分推导，9/15）
    let estBadge = '';
    if(r.granularity === 'whole' && !hasScore){
      const tc = r.parts.reduce((s,p) => s + (p.correct||0), 0);
      const tt = r.parts.reduce((s,p) => s + (p.total||0), 0);
      const band = estimateBand(r.type, tc, tt);
      if(band != null) estBadge = ` <span class="badge up">约 ${band.toFixed(1)} 分</span>`;
      const n = targetCorrectFor(r.type, (DATA.settings.targets || {})[r.type]);
      if(n != null) estBadge += tc >= n
        ? ` <span class="badge up">已达 ${n} 个 ✓</span>`
        : ` <span class="badge">差 ${n - tc} 到 ${n}</span>`;
    }
    return `<div class="score-row mk-row">
      <strong class="mk-date">${r.date}</strong>
      <span class="badge ${r.type[0]}">${cfg.icon} ${cfg.name}</span>
      <span class="badge">${r.granularity==='whole'?'整卷':'单项'}</span>
      ${overallBadge}${estBadge}
      <span class="mk-parts-inline">${partsHtml}</span>
      <button class="plan-del mk-del" data-del="${r.id}" title="删除">✕</button>
      ${mkDetailHtml(r)}
      ${r.note ? `<div class="muted mk-note">${escapeHtml(r.note)}</div>` : ''}
    </div>`;
  }).join('');
  /* 10/17 #9 层次 2：详情展开 / 收起。就地 toggle，不重渲染整表（避免滚动位置丢失）。 */
  box.querySelectorAll('button[data-det]').forEach(b => b.addEventListener('click', () => {
    const det = b.parentNode.querySelector('.mk-det');
    if(!det) return;
    const open = det.hidden;
    det.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.classList.toggle('on', open);
    b.textContent = open ? '收起' : '详情';
  }));
  box.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    if(confirm('删除这条分项模考？')){ DATA.mockRecords = DATA.mockRecords.filter(x => x.id !== b.dataset.del); DATA.deletedIds = DATA.deletedIds || []; if(b.dataset.del != null && !DATA.deletedIds.includes(b.dataset.del)) DATA.deletedIds.push(b.dataset.del); hubSave(); renderMock(); }
  }));
}
function renderMock(){ renderMockStats(); renderMockList(); }

