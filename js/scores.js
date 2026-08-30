/* mode:
   - 'accuracy' 听/读：客观题，录「答对 / 总题数」，算正确率
   - 'score'    口/写：评分制，只录「得分 0–9（含 .5）」，算加权平均
   accuracy 的 part 带 defaultTotal（预填总题数）；score 的 part 带 weight（加权） */
var MOCK_TYPES = {
  listening: { name:'听力', icon:'🎧', mode:'accuracy', color:'var(--mock)',
    parts:[ {label:'P1',defaultTotal:10},{label:'P2',defaultTotal:10},
            {label:'P3',defaultTotal:10},{label:'P4',defaultTotal:10} ] },
  reading:   { name:'阅读', icon:'📖', mode:'accuracy', color:'var(--vocab)',
    parts:[ {label:'P1',defaultTotal:13},{label:'P2',defaultTotal:13},{label:'P3',defaultTotal:14} ] },
  speaking:  { name:'口语', icon:'🗣', mode:'score', color:'var(--med)',
    parts:[ {label:'流利度 Fluency',weight:1},{label:'词汇 Lexical',weight:1},{label:'语法 Grammar',weight:1},{label:'发音 Pronunciation',weight:1} ] },
  writing:   { name:'写作', icon:'✏️', mode:'score', color:'var(--warn)',
    parts:[ {label:'Task 1',weight:1},{label:'Task 2',weight:2} ] }, // Task 2 权重更高
};

/* 模块 C：整卷客观题（听/读）按「答对率 → 雅思 band」近似估分。
   官方对照为 40 题满分制；若实际总题数不是 40，先按比例折算到 40 再查表。
   仅为练习参考，标签带「约」。口语/写作不估（评分制本身即 band）。 */
var BAND_TABLE = {
  reading: [ [39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5] ],
  listening: [ [39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[11,4],[8,3.5],[6,3],[4,2.5] ],
};

ready(() => {
  $('#scoreDate').value = todayKey();
  $('#addScore').addEventListener('click', addScore);
  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });
  // 分项模考（整卷 / 单篇单项）
  $('#mkDate').value = todayKey();
  $('#mkGran').addEventListener('change', onMockGran);
  $('#mkType').addEventListener('change', onMockType);
  $('#mkAdd').addEventListener('click', addMock);
  if($('#mkFilter')) $('#mkFilter').addEventListener('change', renderMockStats);
  onMockType();
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
  const list = DATA.scores.slice().sort((a,b) => b.date.localeCompare(a.date));
  const t = DATA.settings.targets || {};
  const targetOverall = t.overall || 0;
  const hasTargets = targetOverall > 0;

  // stats — 加考试倒计时 + 本场目标（0 次也显示倒计时/目标）
  const cd = examCountdown();
  const examMd = cd.md || '考试';
  const dLabel = cd.label;
  const statBox = $('#scoreStats');
  if(list.length === 0){
    statBox.innerHTML =
      statCard('距 ' + (examMd || '考试') + ' 还有', dLabel, 'var(--warn)') +
      (hasTargets ? statCard('本场目标', targetOverall.toFixed(1), 'var(--med)') : statCard('本场目标', '未设', 'var(--muted)')) +
      '<div style="grid-column:1/-1">' + renderEmpty('还没有成绩记录，考完第一场就来填吧。') + '</div>';
  } else {
    const latest = list[0];
    const lo = overall(latest.listening, latest.reading, latest.writing, latest.speaking);
    const diff = hasTargets ? Math.round((lo - targetOverall) * 2) / 2 : 0;
    statBox.innerHTML =
      statCard('最近总分', lo.toFixed(1), 'var(--primary)') +
      (hasTargets ? statCard('本场目标', targetOverall.toFixed(1), 'var(--med)') : statCard('本场目标', '未设', 'var(--muted)')) +
      (hasTargets ? statCard('距目标', diff >= 0 ? '已超 ' + diff.toFixed(1) + ' 分' : '还差 ' + Math.abs(diff).toFixed(1) + ' 分', diff >= 0 ? 'var(--med)' : 'var(--danger)') : '') +
      statCard('距 ' + (examMd || '考试') + ' 还有', dLabel, 'var(--warn)') +
      statCard('已记录模考', list.length, 'var(--vocab)');
  }

  // bars (latest vs target) — 改为「差 X 分」对比，差距最大项红色置顶
  const barBox = $('#scoreBars');
  if(list.length === 0){
    barBox.innerHTML = renderEmpty('暂无数据。');
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
      const isWorst = m.gap === worstGap && m.gap < 0;   // 仅当确有短板(负 gap)才红
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

  // 行动建议（最弱项）—— 放在 scoreBars 之后、renderTrend() 之前
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
      if(w.gap < 0){
        tipBox.innerHTML = '💡 最弱项 <b>' + w.name + '</b>（差 ' + Math.abs(w.gap).toFixed(1) + ' 分），建议优先练 <a href="practice.html" class="tip-link">' + w.name + ' →</a>';
      } else {
        tipBox.innerHTML = '🎉 四项均已达目标，保持节奏即可～';
      }
    }
  }

  // list
  const box = $('#scoreList');
  if(list.length === 0){ box.innerHTML = renderEmpty('暂无记录。'); return; }
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
}

/* ===== 成绩趋势折线图（SVG） ===== */
function renderTrend(){
  const box = $('#trendChart'); if(!box) return;
  const list = DATA.scores.slice().sort((a,b) => a.date.localeCompare(b.date));
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
      + `<div style="margin-top:8px;font-size:13px;color:var(--muted)">📈 只有 1 次模考，已画出「当前 vs 目标」。再考 1 次就能看完整趋势～</div>`;
    return;
  }
  // 2 次及以上：原有多点折线（保持不变）
  const W = 660, H = 300, padL = 34, padR = 16, padT = 16, padB = 34;
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
  for(let g = 0; g <= 9; g++){
    const gy = Y(g);
    grid += `<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" style="stroke:var(--line)" stroke-width="1"/>`;
    grid += `<text x="${padL-6}" y="${gy+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${g}</text>`;
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
}

/* ===== 综合掌握度雷达图（SVG，最新 vs 目标） ===== */
function renderRadar(){
  const box = $('#radarChart'); if(!box) return;
  const list = DATA.scores.slice().sort((a,b) => b.date.localeCompare(a.date));
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
  $('#mkPartPick').hidden = whole;
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
  }
  toast(msg);
}

/* 判定一个 part 录入是「分数」还是「正确率」：以字段为准，兼容旧记录
   旧记录（改版前）口语/写作也曾存 correct/total —— 这里按字段判定，避免 NaN */
function partIsScore(p){ return typeof p.score === 'number'; }
function partWeight(cfg, label){
  const p = (cfg.parts || []).find(x => x.label === label);
  return (p && typeof p.weight === 'number') ? p.weight : 1;
}

function estimateBand(type, correct, total){
  const tbl = BAND_TABLE[type];
  if(!tbl || !(total > 0)) return null;
  const eq = correct / total * 40;
  if(eq < 4) return null;
  for(const [min, band] of tbl){ if(eq >= min) return band; }
  return null;
}

/* 从口语页日常练习记录聚合四维度均分。
   评分机制关闭后新记录可能无 score，但只要旧记录/评分恢复后仍有 score，就可用。
   返回 { sum, wsum } 对象，标签与 MOCK_TYPES.speaking.parts 一致。 */
function aggregateSpeakingPracticeScores(){
  const byPart = {};
  let totalSum = 0, totalW = 0;
  (DATA.speaking || []).forEach(s => {
    if(!s || !s.answers) return;
    const allAns = Object.values(s.answers);
    allAns.forEach(a => {
      (a && a.records || []).forEach(r => {
        if(!r || !r.score) return;
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

/* 判定是否为口语整卷模考记录（与 mock-history.js / mock.js 保持一致）
   新版：kind==='speaking'；旧版：无 kind，但有 p1 且无数组 parts */
function isSpeakingMockRec(r){
  return r && (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1));
}

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

function mockAggregate(gran){
  const byType = {}, byPart = {};

  DATA.mockRecords.forEach(r => {
    if(gran && gran !== 'all' && r.granularity !== gran) return;

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
    const sp = aggregateSpeakingPracticeScores();
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
  const gran = $('#mkFilter') ? $('#mkFilter').value : 'all';
  const { byType, byPart } = mockAggregate(gran);
  const keys = Object.keys(MOCK_TYPES);
  const hasAny = DATA.mockRecords.length > 0 || (aggregateSpeakingPracticeScores().overall != null);
  const tbox = $('#mkTypeStats');
  if(!hasAny){
    tbox.innerHTML = renderEmpty('还没有分项模考记录，录一条就能看题型表现。');
  } else {
    tbox.innerHTML = '<div class="stat-grid">' + keys.map(ty => {
      const cfg = MOCK_TYPES[ty], a = byType[ty];
      if(cfg.mode === 'score'){
        if(!a || a.wsum === 0) return statCard(cfg.icon + ' ' + cfg.name + '（暂无）', '—', 'var(--muted)');
        const avg = a.sum / a.wsum;
        return statCard(cfg.icon + ' ' + cfg.name + ' 均分', avg.toFixed(1), cfg.color);
      }
      if(!a || a.t === 0) return statCard(cfg.icon + ' ' + cfg.name + '（暂无）', '—', 'var(--muted)');
      const pct = Math.round(a.c / a.t * 100);
      return statCard(cfg.icon + ' ' + cfg.name + ' · ' + a.c + '/' + a.t, pct + '%', cfg.color);
    }).join('') + '</div>';
  }
  const pbox = $('#mkPartStats');
  if(!hasAny){
    pbox.innerHTML = renderEmpty('暂无数据。');
  } else {
    pbox.innerHTML = keys.map(ty => {
      const cfg = MOCK_TYPES[ty];
      const modeTag = cfg.mode === 'score' ? '（各任务均分）' : '（正确率）';
      const rows = cfg.parts.map(p => {
        const a = byPart[ty + '|' + p.label];
        if(cfg.mode === 'score'){
          if(!a || a.wsum === 0) return progressBar(cfg.icon + ' ' + p.label + '（暂无）', 0, 'var(--muted)');
          const avg = a.sum / a.wsum;
          return progressBar(cfg.icon + ' ' + p.label + '　' + avg.toFixed(1), avg / 9 * 100, cfg.color);
        }
        if(!a || a.t === 0) return progressBar(cfg.icon + ' ' + p.label + '（暂无）', 0, 'var(--muted)');
        const pct = a.c / a.t * 100;
        return progressBar(cfg.icon + ' ' + p.label + '　' + a.c + '/' + a.t, pct, cfg.color);
      }).join('');
      return '<div class="mk-grp"><div class="mk-grp-title">' + cfg.icon + ' ' + cfg.name + ' ' + modeTag + '</div>' + rows + '</div>';
    }).join('');
  }
}

function renderMockList(){
  const box = $('#mkList');
  const partRecs = DATA.mockRecords.filter(r => Array.isArray(r.parts)); // 仅展示分项记录；口语整卷模考走专属 tab
  if(partRecs.length === 0){ box.innerHTML = renderEmpty('暂无记录。'); return; }
  const list = partRecs.slice().sort((a,b) => b.date.localeCompare(a.date));
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
      : `<span class="badge">${p.label} ${p.correct}/${p.total}</span>`).join(' ');
    // 整卷客观题：顺带估算卷面分
    let estBadge = '';
    if(r.granularity === 'whole' && !hasScore){
      const tc = r.parts.reduce((s,p) => s + (p.correct||0), 0);
      const tt = r.parts.reduce((s,p) => s + (p.total||0), 0);
      const band = estimateBand(r.type, tc, tt);
      if(band != null) estBadge = ` <span class="badge up">约 ${band.toFixed(1)} 分</span>`;
    }
    return `<div class="score-row" style="align-items:flex-start">
      <strong style="min-width:88px">${r.date}</strong>
      <span class="badge ${r.type[0]}">${cfg.icon} ${cfg.name}</span>
      <span class="badge">${r.granularity==='whole'?'整卷':'单项'}</span>
      ${overallBadge}${estBadge}
      <div style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${partsHtml}</div>
      ${r.note ? `<div class="muted" style="flex-basis:100%">${escapeHtml(r.note)}</div>` : ''}
      <button class="plan-del" data-del="${r.id}" title="删除" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
  box.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    if(confirm('删除这条分项模考？')){ DATA.mockRecords = DATA.mockRecords.filter(x => x.id !== b.dataset.del); DATA.deletedIds = DATA.deletedIds || []; if(b.dataset.del != null && !DATA.deletedIds.includes(b.dataset.del)) DATA.deletedIds.push(b.dataset.del); hubSave(); renderMock(); }
  }));
}
function renderMock(){ renderMockStats(); renderMockList(); }

