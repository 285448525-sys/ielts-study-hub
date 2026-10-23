/* ==========================================================================
   sp-stats.js · 口语页「分数解析与统计」域（T-009 S-1 从 js/speaking.js 原样搬出）
   --------------------------------------------------------------------------
   来源区块：方案 §1.2 的 D 区（原 614-806 行，现 635-825）
   函数（18 个）：parseScore / scoreScopeTip / isNewScore / bestOfQuestion / getBestScore /
        countOfQuestion / getP1Done / getScoreCount / getPracticeCount / getAggScore /
        scoreLabel / lastPracticeTs / lastPracticeLabel / scoreBadgeHtml / _lastPracticeTail /
        _scoreBadgeInner / scoreHeaderHtml
   另含 normalizeScore / clampBand（方案 §三 明写语义属 D，故留在此文件）

   🔴 只换文件住址，函数体一个字没改（T-009 红线）。
   🔴 顶层一律用 var / function —— 软导航 window.eval 重跑时 const 跨文件不可见。
   纯函数域：零 DOM 依赖（只拼 HTML 串），不写 DATA、不碰 localStorage。
   ========================================================================== */

// === 口语分数解析与展示 ===
/* 分数解析（9/20 design/76 重写 + 之之 9/20 拍板恢复发音/流利度自填固定分）：
   · grammar / vocabulary 由 AI 按 IELTS 官方 band descriptor 正向锚定评出（文本唯一能评准的两维）
   · 流利度、发音需音频，AI 一律不评不猜；取设置里用户自填的固定分（0–9），没填/非法值 → null（不计入）
   · overall = 已评维度的均分，四舍五入到 0.5；四项全填时最接近雅思四项口径 */
function parseScore(score){
  if(!score) return null;
  const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  const grammar = n(score.grammar);
  const vocabulary = n(score.vocabulary);
  // 自填固定分：用户在「设置 / 口语模考」里填；没填就不参与，绝不猜（0 是合法值，禁用 ||null 吞 0）
  const sset = DATA.settings || {};
  const pronunciation = (sset.pronunciationScore != null) ? n(sset.pronunciationScore) : null;
  const fluency = (sset.fluencyScore != null) ? n(sset.fluencyScore) : null;
  const dims = [grammar, vocabulary].filter(v => v != null);
  if(fluency != null) dims.push(fluency);
  if(pronunciation != null) dims.push(pronunciation);
  // 9/20 拍板：至少两个维度才有 overall（单维度均分没有意义，不给总分）
  const overall = (dims.length >= 2) ? Math.round(dims.reduce((a, b) => a + b, 0) / dims.length * 2) / 2 : null;
  // 评分依据随分数一起落库：分数必须能自证，否则又变成"莫名其妙的低分"
  const basis = {
    grammar: (score.grammar_basis != null) ? String(score.grammar_basis) : '',
    vocabulary: (score.vocabulary_basis != null) ? String(score.vocabulary_basis) : ''
  };
  return { overall, fluency, pronunciation, vocabulary, grammar, basis };
}
/* 总分口径文案（UI 必须显示，绝不能被当成雅思总分）：按实际参与计算的维度动态生成 */
function scoreScopeTip(){
  const sset = (DATA && DATA.settings) || {};
  const parts = ['语法', '词汇'];
  if(sset.fluencyScore != null) parts.push('流利度(自填)');
  if(sset.pronunciationScore != null) parts.push('发音(自填)');
  return parts.join(' + ') + ' 的均分；未填的自填项不计入（可在设置里补）';
}
// 某小题的历史最高分：遍历每次诊断/提交记录取最高（用户规则：同一题反复刷分取最高值）；
// 老数据没有 records 时回退到当前 score 字段
/* 只认 9/20 新口径的分数：新分数一定带 basis（评分依据）。
   旧口径分数是「扣分制 + 拍脑袋兜底」打出来的，偏低且口径不同，一律不参与聚合，
   避免历史低分重新冒出来打击信心。 */
function isNewScore(sc){
  return !!(sc && sc.overall != null && sc.basis);
}
function bestOfQuestion(a){
  if(!a) return null;
  let best = null;
  (a.records || []).forEach(r => {
    if(r && isNewScore(r.score)){
      const v = parseFloat(r.score.overall);
      if(!isNaN(v) && (best === null || v > best)) best = v;
    }
  });
  if(best === null && isNewScore(a.score)){
    const v = parseFloat(a.score.overall);
    if(!isNaN(v)) best = v;
  }
  return best;
}
function getBestScore(s){
  if(!s || !s.answers) return null;
  let best = null;
  Object.values(s.answers).forEach(a => {
    const v = bestOfQuestion(a);
    if(v != null && (best === null || v > best)) best = v;
  });
  return best;
}
/* === 练习次数统计 ===
   没有新口径分数时（旧数据 / 从未评分），列表显示「练过几次」而不是空白。
   P1 的各小题只要有任一题有 records，就算「练过 1 次」，并显示已完成小题数。
   P2 直接按该题的 records 数量显示练过次数。 */
function countOfQuestion(a){
  if(!a) return 0;
  if(Array.isArray(a.records) && a.records.length) return a.records.length;
  // 老数据：有 score 没 records 的，算练过 1 次
  if(a.score && a.score.overall != null) return 1;
  return 0;
}
function getP1Done(s){
  if(!s || !s.answers) return 0;
  return Object.keys(s.answers).filter(k => k !== 'p2' && countOfQuestion(s.answers[k]) > 0).length;
}
function getScoreCount(s){
  if(!s || !s.answers) return 0;
  return Object.values(s.answers).filter(a => countOfQuestion(a) > 0).length;
}
function getPracticeCount(s){
  if(!s || !s.answers) return 0;
  if(s.type === 'P1') return getP1Done(s) > 0 ? 1 : 0;
  return countOfQuestion(s.answers.p2);
}
/* 聚合分（9/20 评分恢复）：
   P1 = 各已练小题「历史最高分」的平均；P2 = 该题历史最高分。
   只统计新口径分数（isNewScore），旧口径一律不计 —— 无新分数时返回 null，
   列表继续显示「练过N次」。 */
function getAggScore(s){
  if(!s || !s.answers) return null;
  if(s.type === 'P1'){
    const vals = Object.keys(s.answers)
      .filter(k => k !== 'p2')
      .map(k => bestOfQuestion(s.answers[k]))
      .filter(v => v != null);
    if(!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 2) / 2;
  }
  return bestOfQuestion(s.answers.p2);
}
function scoreLabel(v){ return v == null ? '-' : (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1); }
/* 路线图3 · 3b（10/12）：题卡加「最近练习时间」小字。
   数据 = max(answers[*].records[].ts) 现算（P1 数字键 + p2 各一份），无 records 不显示。
   文案口径（她定案）：今天 / 昨天 / N 天前（N≤30）/ 超 1 个月。
   ⚠️ 不用 data.js 的静态 proficiency 字段（那是死值，运行时从不维护，见指令调研）。 */
function lastPracticeTs(s){
  if(!s || !s.answers) return 0;
  let mx = 0;
  try{
    Object.keys(s.answers).forEach(k => {
      const a = s.answers[k];
      if(a && Array.isArray(a.records)) a.records.forEach(r => { if(r && r.ts > mx) mx = r.ts; });
    });
  }catch(e){}
  return mx;
}
function lastPracticeLabel(ts){
  if(!ts) return '';
  const now = new Date();
  const dayMs = 864e5;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if(ts >= startOfToday) return '今天练过';
  if(ts >= startOfToday - dayMs) return '昨天练过';
  const days = Math.floor((startOfToday - ts) / dayMs) + 1;
  if(days <= 30) return days + ' 天前练过';
  return '超 1 个月没练';
}
function scoreBadgeHtml(score, count, s){
  return _scoreBadgeInner(score, count, s) + _lastPracticeTail(s);
}
/* 3b：时间小字拼在徽章后面（独立 span，不碰上面四个 return 的任何字符串 ——
   动 return 就得改四处、还容易漏；包一层只为「追加」，语义零风险）。 */
function _lastPracticeTail(s){
  const lb = lastPracticeLabel(lastPracticeTs(s));
  return lb ? '<span class="sp-last-practice">' + escapeHtml(lb) + '</span>' : '';
}
function _scoreBadgeInner(score, count, s){
  // 没有新口径分数（旧数据 / 从未评分 / AI 未返回分数）→ 显示练过次数，不显示分数
  if(score == null){
    if(!count) return '';
    if(s && s.type === 'P1'){
      // 9/16：小题总数按该题 questions 实际长度算（题库里 P1 小问 4~10 个不等，
      // 原来硬写 4，work/hometown/area 这类 10 小题的话题会显示成「7/4 小题」）
      const total = (s.questions || []).length || 4;
      const done = getP1Done(s);
      const label = done >= total ? '练过1次' : '练过1次（' + done + '/' + total + ' 小题）';
      return '<span class="sp-score-badge practice">' + label + '</span>';
    }
    const label = count > 1 ? '练过' + count + '次' : '练过1次';
    return '<span class="sp-score-badge practice">' + label + '</span>';
  }
  const cls = score >= 5.5 ? 'sp-score-badge good' : (score >= 5 ? 'sp-score-badge ok' : 'sp-score-badge low');
  // 分数不是雅思总分（流利度始终需录音）—— tooltip 里说清当前口径，避免误读
  const tip = scoreScopeTip();
  let label;
  if(s && s.type === 'P1'){
    const done = getP1Done(s);
    // 9/18：小题总数按 questions 实际长度算（硬写 4 会让 10 小题的 work/hometown 显示成「7/4 小题」）
    const total = (s.questions || []).length || 4;
    label = '平均 ' + scoreLabel(score) + '分 · 练过1次' + (done < total ? '（' + done + '/' + total + ' 小题）' : '');
  } else {
    const times = count > 1 ? ' · 练过' + count + '次' : '';
    label = '最高 ' + scoreLabel(score) + '分' + times;
  }
  return '<span class="' + cls + '" title="' + tip + '">' + label + '</span>';
}
function scoreHeaderHtml(score, title){
  if(!score || score.overall == null) return '';
  // 维度按雅思官方顺序：流利度与连贯 → 词汇 → 语法 → 发音；自填项没填就不显示（不再摆一个「-」）
  const dims = [
    {k:'vocabulary',l:'词汇'},
    {k:'grammar',l:'语法'}
  ];
  if(score.fluency != null) dims.unshift({k:'fluency',l:'流利度(自填)'});
  if(score.pronunciation != null) dims.push({k:'pronunciation',l:'发音(自填)'});
  let h = '<div class="sp-score-header">';
  h += '<div class="sp-score-total"><span class="sp-score-num">' + scoreLabel(score.overall) + '</span><span class="sp-score-label">' + (title || '总分') + '</span></div>';
  h += '<div class="sp-score-dims">';
  dims.forEach(d => {
    const v = score[d.k];
    h += '<div class="sp-score-dim"><span class="sp-score-dim-val">' + scoreLabel(v) + '</span><span class="sp-score-dim-lab">' + d.l + '</span></div>';
  });
  h += '</div></div>';
  return h;
}

/* 方案 §三：normalizeScore / clampBand 语义属 D 区（分数净化），随 sp-stats 一起搬 */
function clampBand(v){
  if(v == null || v === '') return null;
  const n = parseFloat(v);
  if(!isFinite(n) || n < 1 || n > 9) return null;
  return Math.round(n * 2) / 2;
}
function normalizeScore(j){
  if(!j || typeof j !== 'object') return j;
  if(!j.score || typeof j.score !== 'object') j.score = {};
  j.score.grammar = clampBand(j.score.grammar);
  j.score.vocabulary = clampBand(j.score.vocabulary);
  j.score.fluency = null;         // 需音频，文本不评
  j.score.pronunciation = null;   // 需音频，文本不评
  delete j.score.overall;
  return j;
}
