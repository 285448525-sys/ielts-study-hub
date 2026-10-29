/* R-E2 · 回顾页 E 版接真数据（第一批：成绩条 / 趋势 / 各科卡 / 右栏）
   🔴 硬约束（施工书 §一）：
     ① 只换数据源，不动结构 —— rvx- 类名与 DOM 层级一个字不改
     ② 判分口径、SRS、数据结构一概不碰（本文件只读 DATA，一个字节都不写）
     ③ history.js 那三个函数的 id 一个都不改（它们的写入目标节点全部保留）
   渲染目标全部是 R-E1 骨架里新加的 id（rvx* 前缀），旧面板节点一个都没动。 */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function hm(sec){ return (typeof fmtHM === 'function') ? fmtHM(sec) : String(Math.round(sec / 60)) + 'm'; }
  /* one() = 雅思带分口径（四舍五入到 0.5），只用于「总分 / 单科分 / 差距」这类带分。
     raw() = 一位小数原样，用于口语四维（AI 给的 6.7 / 5.9 这类原始分 —— 用 one() 会被
     抹成 6.5 / 6.0，实测踩到，属于「拿带分口径去显示非带分数据」）。 */
  function one(v){ var n = Number(v); return isFinite(n) ? (Math.round(n * 2) / 2).toFixed(1) : null; }
  function raw(v){ var n = Number(v); return isFinite(n) ? n.toFixed(1) : null; }

  /* EMP-1（10-26）：统计卡里的空占位统一走这里。
     原写法是纯文本 "--" —— 视觉上像「值没读出来 / 页面炸了」；
     改用 em dash「—」+ .stat-empty 淡色，一眼区分「正常还没有数据」与「出错了」。
     只换呈现，不动任何取数口径。 */
  function statEmptyHtml(){ return '<span class="stat-empty">—</span>'; }
  function setStat(el, val, fmt){
    if(!el) return;
    if(val == null || (typeof val === "number" && !isFinite(val))){ el.innerHTML = statEmptyHtml(); return; }
    el.textContent = fmt ? fmt(val) : one(val);
  }

  /* 四科口径一次定义，下面全用它（颜色与骨架里图例的一致） */
  var SUBS = [
    { k: 'listening', name: '听力', color: 'var(--mock)',  nid: 'rvxNumL', sid: 'rvxSubL' },
    { k: 'reading',   name: '阅读', color: 'var(--vocab)', nid: 'rvxNumR', sid: 'rvxSubR' },
    { k: 'writing',   name: '写作', color: 'var(--warn)',  nid: 'rvxNumW', sid: 'rvxSubW' },
    { k: 'speaking',  name: '口语', color: 'var(--med)',   nid: 'rvxNumS', sid: 'rvxSubS' }
  ];

  function scores(){ return Array.isArray(DATA.scores) ? DATA.scores.slice() : []; }

  /* 🔴 RV-PAGE-REDESIGN-1（10-29）：趋势图当前选中的科目。
     'overall' = 总分（当天有记录科目的平均）；其余为 SUBS 里的 k。 */
  var TREND_PICK = 'overall';
  function colorOf(k){
    var c = 'var(--primary)';
    SUBS.forEach(function(se){ if (se.k === k) c = se.color; });
    return c;
  }
  function setTrendPick(k){
    if (k !== 'overall' && !SUBS.some(function(se){ return se.k === k; })) return;
    TREND_PICK = k;
    var box = document.getElementById('rvxTrendChips');
    if (box){
      [].forEach.call(box.querySelectorAll('.rvx-chip'), function(b){
        b.classList.toggle('rvx-on', b.getAttribute('data-k') === k);
      });
    }
    try { paintTrend(); } catch(e){}
  }
  window.rvxTrendPick = setTrendPick;
  function sortedScores(){
    return scores().sort(function(a, b){ return String(a.date || '').localeCompare(String(b.date || '')); });
  }
  function targets(){ return (DATA.settings && DATA.settings.targets) || {}; }
  function mockAll(){ return Array.isArray(DATA.mockRecords) ? DATA.mockRecords : []; }

  /* ===== ① 成绩条：5 组「当前分 + 目标差距」 =====
     总分走 overall()（全站唯一口径，与 scores.js / 首页冲刺卡同一个函数），不自己算平均。 */
  function paintStrip(){
    var list = sortedScores();
    var t = targets();
    var last = list.length ? list[list.length - 1] : null;

    /* 总分 */
    var allEl = $('rvxNumAll'), allSub = $('rvxSubAll');
    var allVal = last ? overall(last.listening, last.reading, last.writing, last.speaking) : null;
    if (allEl) setStat(allEl, allVal);
    if (allSub){
      if (allVal == null) allSub.textContent = list.length ? '还没有完整成绩' : '还没有成绩';
      else allSub.innerHTML = gapHtml(allVal, t.overall);
    }

    /* 四科 */
    SUBS.forEach(function(s){
      var el = $(s.nid), sub = $(s.sid);
      var v = last ? (last[s.k] == null ? null : Number(last[s.k])) : null;
      if (el) setStat(el, v);
      if (sub) sub.innerHTML = (v == null || !isFinite(v)) ? '—' : gapHtml(v, t[s.k]);
    });

    /* 目标没设时 gapHtml 会返回「目标未设」，这里再兜一句总提示 */
    if (allSub && !Number(t.overall)) allSub.textContent = allVal == null ? '还没有成绩' : '目标未设';
  }
  /* 差距文案：与骨架同款（达标给 .rvx-yes、没达标给 .rvx-no） */
  function gapHtml(v, tgt){
    var g = Number(tgt);
    if (!g) return '<span class="rvx-muted">目标未设</span>';
    var d = Math.round((g - v) * 2) / 2;
    if (d <= 0) return '<span class="rvx-yes">已达标</span>' + (d < 0 ? ' · 超 ' + one(-d) : '');
    return '目标 ' + one(g) + ' · <span class="rvx-no">还差 ' + one(d) + '</span>';
  }

  /* ===== ② 顶部条：倒计时 / 已记录 / 连续&活跃&累计 / 最弱项 ===== */
  function paintTopBar(){
    /* 倒计时 —— 复用 examCountdown()（她每天最想看的数，不能自己重算） */
    var cd = (typeof examCountdown === 'function') ? examCountdown() : null;
    var lab = $('rvxCdLab'), val = $('rvxCdVal'), unit = $('rvxCdUnit');
    if (cd && cd.hasExam){
      if (lab) lab.textContent = '距 ' + cd.md;
      if (val) val.textContent = cd.daysLeft == null ? '—' : String(Math.max(0, cd.daysLeft));
      if (unit) unit.textContent = cd.daysLeft != null && cd.daysLeft <= 0 ? '' : '天';
    } else {
      if (lab) lab.textContent = '考试日期未设';
      if (val) val.textContent = '—';
      if (unit) unit.textContent = '';
    }

    /* 已记录场次：整卷成绩条数（DATA.scores 就是「整卷」那一类，与旧面板 #scoreStats 同口径） */
    var n = $('rvxRecN'); if (n) n.textContent = String(scores().length);

    /* 连续 / 活跃 / 累计 —— 三个都借现成口径，不重写 */
    var streakEl = $('rvxStreakN'), actEl = $('rvxActN'), focusEl = $('rvxFocusN');
    var sess = Array.isArray(DATA.sessions) ? DATA.sessions : [];
    var streak = (typeof calcStreak === 'function') ? calcStreak() : 0;
    if (streakEl) streakEl.textContent = String(streak);

    var byDay = {};
    sess.forEach(function(s){ if (s && s.date) byDay[s.date] = (byDay[s.date] || 0) + (s.durationSec || 0); });
    var active = 0;
    for (var i = 0; i < 30; i++){
      var d = new Date(); d.setDate(d.getDate() - i);
      if ((byDay[todayKey(d)] || 0) > 0) active++;
    }
    if (actEl) actEl.textContent = active + '/30';

    var totalSec = sess.reduce(function(a, s){ return a + ((s && s.durationSec) || 0); }, 0);
    if (focusEl) focusEl.textContent = totalSec >= 3600 ? (Math.round(totalSec / 360) / 10).toFixed(1) + 'h' : Math.round(totalSec / 60) + 'm';

    /* 今天状态标签：与 continuous 那三个数联动，不再写死「今天还没开始」 */
    var tag = $('rvxTodayTag');
    if (tag){
      var todaySec = byDay[todayKey()] || 0;
      if (todaySec > 0){ tag.textContent = '今天已学 ' + hm(todaySec); tag.className = 'rvx-tag rvx-flat'; }
      else { tag.textContent = '今天还没开始'; tag.className = 'rvx-tag rvx-flat'; }
    }

    /* 最弱项：四科里「距目标差距最大」的那一科；全达标或无目标时给一句人话 */
    var weak = $('rvxWeak'), weakWrap = $('rvxWeakWrap'), weakGo = $('rvxWeakGo');
    var list = sortedScores(), t = targets();
    var lastRec = list.length ? list[list.length - 1] : null;
    var worst = null, worstGap = 0;
    if (lastRec){
      SUBS.forEach(function(s){
        var tgt = Number(t[s.k]); if (!tgt) return;
        var v = Number(lastRec[s.k]); if (!isFinite(v)) return;
        var gap = Math.round((tgt - v) * 2) / 2;
        if (gap > worstGap){ worstGap = gap; worst = s; }
      });
    }
    if (weak){
      if (worst){
        weak.innerHTML = esc(worst.name) + '（还差 ' + one(worstGap) + '）';
        weak.style.color = 'var(--danger)';
        if (weakGo) weakGo.hidden = false;
      } else {
        weak.textContent = lastRec ? '全部达标' : '还没有成绩';
        weak.style.color = lastRec ? 'var(--med)' : 'var(--muted)';
        if (weakGo) weakGo.hidden = !!lastRec;
      }
    }
    if (weakWrap) weakWrap.hidden = false;
  }

  /* ===== ③ 总分+四科趋势图（骨架里是写死的 SVG，这里整块重画） =====
     🔴 10-28 SCORE-TREND-1（她 13:1x：「回顾成绩这里不能只记录实战的成绩，把平常模考啊、
        我自己输入进去的记录都要弄进去。我记得你们之前也出过方案，为什么没有做进去啊？」）
     这一步是全站**唯一真正显示**的成绩趋势图（旧面板 #trendChart 那一套已被 .review-wrap 的
     清场规则藏掉，写在那里等于白写 —— 这一轮我先写错在那里，实测 0×0 才发现）。
     数据源从「仅 DATA.scores 整卷」扩为双源：
       · DATA.scores       = 整卷 / 实考（她手动录入）→ 点画实心
       · DATA.mockRecords  = 模考自动记录（阅读/听力整卷或单篇、写作 AI 评分、口语整卷模考）→ 点画空心
     口径按样子稿 design/_预览-成绩趋势含模考-2026-10-27.html：
       1. 每科各画各的线，该科有几分进几分；某科某天没记录就断开，不拿假点连
       2. 来源只用点的样式区分（实心/空心），不加筛选器、不加第二套控件
       3. 同日同科多条只取当天最后一条（各天历史全保留）—— 趋势看的是每天最终水平
       4. 目标虚线常驻（她本机 targets 四项都是 0 = 还没设，此时不画线、不印「目标 0」） */
  function pairPoints(){
    /* 返回 { dates:[...], per:{科:[{date,v,real}]}, labels }
       同日同科多条 → 后写覆盖前写（mockRecords 在 scores 之后遍历，同一天以模考记录为最新），
       但「real」标记一旦有过实考就保留为实心（实考那天不该被一条模考漂成空心）。 */
    var per = {}, seen = {};
    SUBS.forEach(function(se){ per[se.k] = {}; });
    function put(k, date, v, real){
      if (!per[k]) return;
      var n = Number(v);
      if (!isFinite(n) || n <= 0 || n > 9) return;
      var d = String(date || '').slice(0, 10);
      if (!d) return;
      var cell = per[k][d];
      if (cell){ cell.v = n; cell.real = cell.real || !!real; }
      else per[k][d] = { date: d, v: n, real: !!real };
      seen[d] = true;
    }

    /* 源 1：整卷 / 实考 */
    scores().forEach(function(s){
      if (!s) return;
      SUBS.forEach(function(se){ put(se.k, s.date, s[se.k], true); });
    });

    /* 源 2：DATA.mockRecords（模考自动记录 + 写作 AI 评分 + 口语整卷模考） */
    mockAll().forEach(function(r){
      if (!r) return;
      /* 口语整卷模考：与 isSpeakingMockRec 同口径（新版 kind，旧版无 parts 但有 p1） */
      if (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1)){
        put('speaking', r.date, r.overall, false);
        return;
      }
      if (!Array.isArray(r.parts) || !r.type || !per[r.type]) return;
      var cfg = (typeof MOCK_TYPES !== 'undefined' && MOCK_TYPES[r.type]) || null;
      if (!cfg) return;
      var v = null;
      if (cfg.mode === 'score'){
        /* 口语/写作：parts[].score 加权平均（写作 Task 2 权重 2，与 MOCK_TYPES 一致） */
        var wsum = 0, acc = 0;
        r.parts.forEach(function(p){
          if (typeof p.score !== 'number') return;
          var w = (typeof p.weight === 'number' && p.weight > 0) ? p.weight : 1;
          wsum += w; acc += p.score * w;
        });
        if (wsum > 0) v = acc / wsum;
        if (v == null && typeof r.overall === 'number') v = r.overall;
      } else {
        /* 阅读/听力：优先用落库时算好的 overall（estimateBand），没有就按对题数现场折算 */
        if (typeof r.overall === 'number') v = r.overall;
        else {
          var tc = 0, tt = 0;
          r.parts.forEach(function(p){ tc += Number(p.correct) || 0; tt += Number(p.total) || 0; });
          if (tt && typeof estimateBand === 'function') v = estimateBand(r.type, tc, tt);
        }
      }
      if (v != null) put(r.type, r.date, v, false);
    });

    var dates = Object.keys(seen).sort();
    return { dates: dates, per: per };
  }

  function paintTrend(){
    var host = document.querySelector('#rvxE1 .rvx-two > div:first-child .rvx-card .rvx-card-p');
    if (!host) return;
    /* 找到骨架里那张 SVG 的父容器（overflow-x:auto 的 div），整块换掉 */
    var wrap = host.querySelector('div[style*="overflow-x"]');
    var legend = host.querySelector('.rvx-lgd');
    if (legend){
      /* 一次只看一科（终稿），图例只说当前这条线是什么 + 两种点的含义 */
      var curName = '总分';
      SUBS.forEach(function(se){ if (se.k === TREND_PICK) curName = se.name; });
      legend.innerHTML = '<span><i class="rvx-dot" style="background:' + (TREND_PICK === 'overall' ? 'var(--primary)' : colorOf(TREND_PICK)) + '"></i>' + curName + '</span>'
        + '<span class="rvx-lgd-src"><i class="rvx-dot rvx-dot-fill"></i>实考 / 整卷</span>'
        + '<span class="rvx-lgd-src"><i class="rvx-dot rvx-dot-hollow"></i>模考 · 平时添加 · AI 评分</span>';
    }
    var lab = document.getElementById('rvxTrendLab');
    if (lab){
      var nm = '总分';
      SUBS.forEach(function(se){ if (se.k === TREND_PICK) nm = se.name; });
      lab.textContent = nm + ' · 按考试场次' + (TREND_PICK === 'overall' ? '（当天有记录的科目取平均）' : '');
    }
    if (!wrap) return;

    var got = pairPoints();
    var dates = got.dates, per = got.per;
    if (!dates.length){
      wrap.innerHTML = '<div class="rvx-fn" style="padding:26px 4px;text-align:center">还没有成绩记录。<br>模考、AI 评分、你自己录入的成绩都会进这张图。</div>';
      return;
    }
    /* 🔴 RV-PAGE-REDESIGN-1（10-29）：成绩栏改成单列后这张图占满 1132px，
       原来的 720×250 画布被拉到 393px 高（太肥，终稿是扁的 900×205）。
       改法：画布放宽到 900 并在 SVG 上钉 max-width:900px —— 与终稿同比例，
       卡片更宽时也不会继续拉高（不再靠 height 硬压，避免文字变形）。 */
    var W = 900, H = 230, padL = 26, padR = 10, padT = 14, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = dates.length;
    var X = function(i){ return n === 1 ? padL + plotW / 2 : padL + plotW * i / (n - 1); };
    var Y = function(v){ return padT + plotH * (1 - Math.max(0, Math.min(9, Number(v))) / 9); };
    var t = targets();

    var s = '';
    for (var g = 0; g <= 9; g++){
      var gy = Y(g);
      s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" style="stroke:var(--line)" stroke-width="1" opacity="' + (g % 2 ? '.4' : '.9') + '"></line>';
      if (g >= 4 && g <= 9) s += '<text x="' + (padL - 6) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-size="10" style="fill:var(--muted)" font-variant-numeric="tabular-nums">' + g + '</text>';
    }
    /* 目标虚线常驻（只对有设目标的科目画；她四项都是 0 → 一条都不画，不印「目标 0」） */
    SUBS.forEach(function(se){
      var tgt = Number(t[se.k]);
      if (!tgt || tgt <= 0) return;
      var ty = Y(tgt);
      s += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" style="stroke:' + se.color + '" stroke-width="1" stroke-dasharray="5 4" opacity=".45"></line>';
    });
    /* 🔴 RV-PAGE-REDESIGN-1（10-29）：终稿的趋势图「一次只看一科」——
       上面那排筛选器（#rvxTrendChips）决定画哪条，默认「总分」。
       总分口径：当天有记录科目的平均，**不足两科不画点**（单科成绩不能冒充总分）。 */
    var pick = TREND_PICK;
    if (pick !== 'overall' && !per[pick]) pick = 'overall';
    var cells = null, lineColor = 'var(--primary)';
    if (pick === 'overall'){
      cells = {};
      dates.forEach(function(d){
        var vs = SUBS.map(function(se){ return per[se.k][d]; }).filter(Boolean).map(function(c){ return c.v; });
        if (vs.length >= 2){
          cells[d] = { date: d, v: vs.reduce(function(a, b){ return a + b; }, 0) / vs.length, real: true };
        }
      });
    } else {
      cells = per[pick];
      SUBS.forEach(function(se){ if (se.k === pick) lineColor = se.color; });
    }
    /* 只连有点的位置：中间缺记录就断开，不拿假点把断档连成「趋势」 */
    var idx = [];
    dates.forEach(function(d, i){ if (cells[d]) idx.push(i); });
    if (idx.length > 1){
      var pts = idx.map(function(i){ return X(i) + ',' + Y(cells[dates[i]].v); });
      s += '<polyline points="' + pts.join(' ') + '" fill="none" style="stroke:' + lineColor + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity=".92"></polyline>';
    }
    idx.forEach(function(i){
      var c = cells[dates[i]];
      var isLast = (i === idx[idx.length - 1]);
      s += c.real
        ? '<circle cx="' + X(i) + '" cy="' + Y(c.v) + '" r="' + (isLast ? 4 : 2.8) + '" style="fill:' + lineColor + '"></circle>'
        : '<circle cx="' + X(i) + '" cy="' + Y(c.v) + '" r="' + (isLast ? 3.4 : 2.6) + '" style="fill:var(--surface);stroke:' + lineColor + '" stroke-width="2"></circle>';
    });
    /* X 轴日期：点多时只标首/中/尾，避免糊成一团 */
    var step = n <= 6 ? 1 : Math.ceil(n / 6);
    dates.forEach(function(d, i){
      if (i % step && i !== n - 1) return;
      /* 首尾两个标签靠边锚（middle 锚会被画布裁掉半个字，实测最右那个变成「10-2」） */
      var anc = (i === 0 && n > 1) ? 'start' : ((i === n - 1 && n > 1) ? 'end' : 'middle');
      s += '<text x="' + X(i) + '" y="' + (H - padB + 15) + '" text-anchor="' + anc + '" font-size="9.5" style="fill:var(--muted)" font-variant-numeric="tabular-nums">' + esc(String(d).slice(5)) + '</text>';
    });
    wrap.innerHTML = '<svg aria-hidden="true" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;width:100%;height:auto;min-width:300px;max-width:900px">' + s + '</svg>';
  }

  /* ===== ④ 四张科目卡：最近分 / 最近 3 次 / 该科走势 / Part 正确率 ===== */
  function paintSubjCards(){
    var list = sortedScores();
    var t = targets();
    var mocks = mockAll();

    SUBS.forEach(function(se){
      var card = document.querySelector('#rvxE1 .rvx-subj[data-subj="' + se.k + '"]');
      if (!card) return;
      var mine = list.filter(function(r){ return r[se.k] != null && isFinite(Number(r[se.k])); });
      var last = mine.length ? mine[mine.length - 1] : null;

      /* 头部：分数 / 最近 3 次 / 差距标签 */
      var scEl = card.querySelector('.rvx-subj-sc');
      var tEl  = card.querySelector('.rvx-subj-t');
      var tagEl = card.querySelector('.rvx-tag');
      if (scEl) scEl.textContent = last ? one(last[se.k]) : '—';
      if (tEl){
        var last3 = mine.slice(-3).map(function(r){ return one(r[se.k]); });
        tEl.textContent = last3.length ? ('最近 ' + last3.length + ' 次：' + last3.join(' · ')) : '还没有这一科的成绩';
      }
      if (tagEl){
        var tgt = Number(t[se.k]);
        if (!last || !tgt){ tagEl.textContent = last ? '目标未设' : '暂无数据'; tagEl.className = 'rvx-tag rvx-flat'; }
        else {
          var d = Math.round((tgt - Number(last[se.k])) * 2) / 2;
          if (d <= 0){ tagEl.textContent = '已达标'; tagEl.className = 'rvx-tag rvx-up'; }
          else { tagEl.textContent = '还差 ' + one(d); tagEl.className = 'rvx-tag rvx-down'; }
        }
      }

      /* 该科小走势图（骨架里那句「12 场走势」） */
      var hEl = card.querySelector('.rvx-subj-b > div:first-child .rvx-h');
      if (hEl) hEl.textContent = mine.length ? (mine.length + ' 场走势') : '走势';
      var sw = card.querySelector('.rvx-subj-b > div:first-child div[style*="overflow-x"]');
      if (sw){
        if (mine.length < 1){
          sw.innerHTML = '<div class="rvx-fn" style="padding:10px 2px">这一科还没有成绩。</div>';
        } else {
          sw.innerHTML = miniTrend(mine.map(function(r){ return Number(r[se.k]); }), mine.map(function(r){ return r.date; }), se.color);
        }
      }

      /* Part / Task 正确率：来自 DATA.mockRecords 的 parts[]（整卷按 P1..P4 汇总，
         单篇就一条）。粒度只认这一科（type 匹配）。口语卡那里是四维分，单独处理。 */
      if (se.k === 'speaking'){ paintSpeakingCard(card, mocks, last); return; }
      paintPartBars(card, se.k, mocks);
    });
  }

  function miniTrend(vals, dates, color){
    var W = 480, H = 120, padL = 26, padR = 10, padT = 10, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = vals.length;
    var X = function(i){ return n === 1 ? padL + plotW / 2 : padL + plotW * i / (n - 1); };
    var Y = function(v){ return padT + plotH * (1 - Math.max(0, Math.min(9, v)) / 9); };
    var s = '';
    for (var g = 4; g <= 9; g++){
      var gy = Y(g);
      s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" style="stroke:var(--line)" stroke-width="1" opacity="' + (g % 2 ? '.4' : '.9') + '"></line>';
      s += '<text x="' + (padL - 6) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-size="10" style="fill:var(--muted)" font-variant-numeric="tabular-nums">' + g + '</text>';
    }
    s += '<polyline points="' + vals.map(function(v, i){ return X(i) + ',' + Y(v); }).join(' ') + '" fill="none" style="stroke:' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity=".92"></polyline>';
    vals.forEach(function(v, i){ s += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="' + (i === n - 1 ? 4 : 2.6) + '" style="fill:' + color + '"></circle>'; });
    var step = n <= 5 ? 1 : Math.ceil(n / 5);
    dates.forEach(function(d, i){
      if (i % step && i !== n - 1) return;
      var anc2 = (i === 0 && n > 1) ? 'start' : ((i === n - 1 && n > 1) ? 'end' : 'middle');
      s += '<text x="' + X(i) + '" y="' + (H - padB + 15) + '" text-anchor="' + anc2 + '" font-size="9.5" style="fill:var(--muted)" font-variant-numeric="tabular-nums">' + esc(String(d || '').slice(5)) + '</text>';
    });
    return '<svg aria-hidden="true" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;width:100%;height:auto;min-width:300px">' + s + '</svg>';
  }

  /* Part 正确率：把这一科所有 mockRecords 里的 parts 按 label 汇总（正确数 / 总数） */
  function paintPartBars(card, type, mocks){
    var host = card.querySelector('.rvx-subj-b > div:last-child .rvx-ptab');
    var titleEl = card.querySelector('.rvx-subj-b > div:last-child .rvx-h');
    if (!host) return;
    var agg = {}, order = [];
    mocks.filter(function(r){ return r && r.type === type && Array.isArray(r.parts); }).forEach(function(r){
      r.parts.forEach(function(p){
        if (!p || !p.label) return;
        if (!agg[p.label]){ agg[p.label] = { ok: 0, tot: 0, ord: order.length }; order.push(p.label); }
        agg[p.label].ok += Number(p.correct) || 0;
        agg[p.label].tot += Number(p.total) || 0;
      });
    });
    if (!order.length){
      if (titleEl) titleEl.textContent = (type === 'writing' ? 'Task 正确率' : 'Part 正确率');
      host.innerHTML = '<div class="rvx-fn" style="padding:8px 2px">还没有分项数据 —— 做完这一科的模考就会出来。</div>';
      return;
    }
    /* 排序：P1/P2… 或 T1/T2 按数字；其他按出现顺序 */
    order.sort(function(a, b){
      var na = parseInt(String(a).replace(/\D/g, ''), 10), nb = parseInt(String(b).replace(/\D/g, ''), 10);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return agg[a].ord - agg[b].ord;
    });
    if (titleEl) titleEl.textContent = (type === 'writing' ? 'Task 正确率' : 'Part 正确率');
    host.innerHTML = order.map(function(lb){
      var o = agg[lb];
      var pct = o.tot ? Math.round(o.ok / o.tot * 100) : 0;
      var col = pct >= 80 ? 'var(--med)' : (pct >= 60 ? 'var(--warn)' : 'var(--danger)');
      return '<div class="rvx-prow"><span class="rvx-muted">' + esc(lb) + '</span>'
        + '<span class="rvx-pb"><i style="width:' + pct + '%;background:' + col + '"></i></span>'
        + '<b>' + pct + '%</b></div>';
    }).join('');
  }

  /* 口语卡：四维（最近一场）+ 题库进度（她自己的练习记录）+ 最近 4 场 + 错误总结 */
  function paintSpeakingCard(card, mocks, lastScore){
    var spk = mocks.filter(function(r){ return r && r.type === 'speaking'; })
                   .sort(function(a, b){ return String(a.date || '').localeCompare(String(b.date || '')); });
    var latest = spk.length ? spk[spk.length - 1] : null;

    /* 四维：优先读 dims（AI 记录），退到旧字段 */
    var host = card.querySelector('.rvx-subj-b > div:first-child .rvx-ptab');
    var head = card.querySelector('.rvx-subj-b > div:first-child .rvx-h');
    if (head) head.textContent = latest ? ('四维 · 最近一场（' + esc(latest.date || '') + '）') : '四维 · 还没有口语模考';
    if (host){
      var dims = latest && latest.dims ? latest.dims : null;
      if (!dims){
        host.innerHTML = '<div class="rvx-fn" style="padding:8px 2px">还没有口语模考记录 —— 做完一场会在这里出四维分。</div>';
      } else {
        var rows = [
          { n: '流利度', v: dims.fluency != null ? dims.fluency : dims.fc },
          { n: '词汇',   v: dims.lexical != null ? dims.lexical : dims.lr },
          { n: '语法',   v: dims.grammar != null ? dims.grammar : dims.gra },
          { n: '发音',   v: dims.pronunciation }
        ];
        host.innerHTML = rows.map(function(r){
          var v = Number(r.v);
          if (!isFinite(v)) return '';
          var pct = Math.round(Math.min(9, Math.max(0, v)) / 9 * 100);
          var col = pct >= 78 ? 'var(--med)' : (pct >= 56 ? 'var(--warn)' : 'var(--danger)');
          return '<div class="rvx-prow"><span class="rvx-muted">' + r.n + '</span>'
            + '<span class="rvx-pb"><i style="width:' + pct + '%;background:' + col + '"></i></span>'
            + '<b>' + raw(v) + '</b></div>';
        }).join('') || '<div class="rvx-fn" style="padding:8px 2px">这场记录里没有分维数据。</div>';
      }
    }
    var fn = card.querySelector('.rvx-subj-b > div:first-child .rvx-fn');
    if (fn) fn.textContent = latest ? '四维来自 AI 评分；发音是独立一维，不计入其他科。' : '';

    /* 题库进度：她练过的口语题（DATA.speakingPractice 之类不存在时给 0） */
    var progHost = card.querySelectorAll('.rvx-subj-b > div:first-child .rvx-ptab')[1];
    if (progHost){
      var rec = (DATA.speaking && Array.isArray(DATA.speaking.records)) ? DATA.speaking.records : [];
      var byFreq = {};
      rec.forEach(function(r){ if (r && r.freq) byFreq[r.freq] = (byFreq[r.freq] || 0) + 1; });
      var total = (DATA.speaking && Array.isArray(DATA.speaking.questions)) ? DATA.speaking.questions.length : 0;
      if (!total){
        progHost.innerHTML = '<div class="rvx-fn" style="padding:8px 2px">题库未加载。</div>';
      } else {
        var done = rec.length;
        var pct = Math.round(done / total * 100);
        progHost.innerHTML = '<div class="rvx-prow"><span class="rvx-muted">已练</span>'
          + '<span class="rvx-pb"><i style="width:' + pct + '%;background:var(--med)"></i></span>'
          + '<b>' + done + '/' + total + '</b></div>';
      }
    }
    var pfn = card.querySelectorAll('.rvx-subj-b > div:first-child .rvx-fn')[1];
    if (pfn) pfn.textContent = '';

    /* 最近 4 场 + 错误总结 */
    var rightCol = card.querySelector('.rvx-subj-b > div:last-child');
    if (!rightCol) return;
    var listHost = rightCol.querySelector('.rvx-h + div') || null;
    var h2 = rightCol.querySelectorAll('.rvx-h');
    if (h2[0]) h2[0].textContent = spk.length ? (spk.length + ' 场模考') : '模考记录';
    /* 重建最近几场（骨架里是 4 个写死的 row，整块换掉） */
    var rowsHtml = spk.slice(-4).reverse().map(function(r){
      var v = r.overall != null ? Number(r.overall) : (r.score != null ? Number(r.score) : null);
      return '<div class="rvx-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-soft);font-size:13px">'
        + '<span class="rvx-mono rvx-muted">' + esc(String(r.date || '').slice(5)) + '</span>'
        + '<b class="rvx-mono" style="font-size:15px">' + (v == null ? '—' : one(v)) + '</b></div>';
    }).join('');
    /* 重建「最近几场」整块。
       ⚠️ 别用 children[i] 编号插入 —— 自己插进去的节点会把后面的索引挤乱。
          第一版就是这么错的：box.innerHTML 里写了行，实际没进 DOM，
          页面显示「还没有口语模考记录」（探针 D13 抓到）。
       改成：定位「错误总结」那个标题，把它之前、第一块内容之后的所有兄弟节点摘掉，再顺序 append。 */
    var errHead = h2[1] || null;
    if (errHead && errHead.parentNode === rightCol){
      var kill = [];
      var walk = errHead.previousElementSibling;
      while (walk && walk !== h2[0]){ kill.push(walk); walk = walk.previousElementSibling; }
      kill.forEach(function(n2){ if (n2.parentNode === rightCol) rightCol.removeChild(n2); });
      if (h2[0] && h2[0].parentNode === rightCol) rightCol.removeChild(h2[0]);
      var hdr = document.createElement('div');
      hdr.className = 'rvx-h';
      hdr.style.marginBottom = '8px';
      hdr.textContent = spk.length ? (spk.length + ' 场模考') : '模考记录';
      rightCol.insertBefore(hdr, errHead);
      if (rowsHtml){
        var box = document.createElement('div');
        box.id = 'rvxSpkHist';
        box.innerHTML = rowsHtml;
        rightCol.insertBefore(box, errHead);
      } else {
        var empty = document.createElement('div');
        empty.className = 'rvx-fn';
        empty.style.padding = '4px 0 8px';
        empty.textContent = '还没有口语模考记录。';
        rightCol.insertBefore(empty, errHead);
      }
    }
    /* 错误总结：screenshots 里那句「还没生成过」换成真实判断 */
    var errBox = rightCol.querySelectorAll('div[style*="background:var(--surface-2)"]');
    if (errBox.length && errBox[errBox.length - 1]){
      var sum = (typeof DATA.mockSummary === 'string' && DATA.mockSummary.trim()) ? DATA.mockSummary : '';
      errBox[errBox.length - 1].textContent = sum || '还没生成过。做完一场口语模考后在上面点「生成总结」。';
    }
  }

  /* ===== ⑤ 全部记录：三类合一（整卷 / 分项 / 口语模考） ===== */
  var REC_ALL = [];
  function buildRecords(){
    var out = [];
    scores().forEach(function(r){
      var all = overall(r.listening, r.reading, r.writing, r.speaking);
      out.push({
        date: r.date, kind: 'whole', score: all,
        text: '听 ' + one(r.listening) + ' · 读 ' + one(r.reading) + ' · 写 ' + one(r.writing) + ' · 说 ' + one(r.speaking)
      });
    });
    mockAll().forEach(function(r){
      if (!r) return;
      if (r.type === 'speaking'){
        var v = r.overall != null ? r.overall : r.score;
        var d = r.dims || {};
        out.push({
          date: r.date, kind: 'speaking',
          score: v == null ? null : Number(v),
          text: '语法 ' + one(d.grammar != null ? d.grammar : d.gra) + ' · 词汇 ' + one(d.lexical != null ? d.lexical : d.lr) + ' · 流利 ' + one(d.fluency != null ? d.fluency : d.fc) + ' · 发音 ' + one(d.pronunciation)
        });
        return;
      }
      /* 分项：按 parts 汇总正确率（整卷也进「分项」口径会让同一次考两条，故只收 granularity:part） */
      var ok = 0, tot = 0;
      (r.parts || []).forEach(function(p){ ok += Number(p.correct) || 0; tot += Number(p.total) || 0; });
      if (!tot) return;
      out.push({
        date: r.date, kind: 'part',
        score: Math.round(ok / tot * 100), isPct: true,
        text: (r.type === 'listening' ? '听力' : r.type === 'reading' ? '阅读' : r.type === 'writing' ? '写作' : (r.type || '分项'))
              + ' · ' + ok + '/' + tot
      });
    });
    out.sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')); });
    return out;
  }
  var recFilter = 'all';
  function paintRecords(){
    REC_ALL = buildRecords();
    var rowsHost = $('rvxRecRows'), countEl = $('rvxRecCount'), fnEl = $('rvxRecFn');
    if (!rowsHost) return;

    var whole = REC_ALL.filter(function(r){ return r.kind === 'whole'; }).length;
    var part  = REC_ALL.filter(function(r){ return r.kind === 'part'; }).length;
    var spk   = REC_ALL.filter(function(r){ return r.kind === 'speaking'; }).length;
    if ($('rvxChipWhole')) $('rvxChipWhole').textContent = String(whole);
    if ($('rvxChipPart'))  $('rvxChipPart').textContent = String(part);
    if ($('rvxChipSpk'))   $('rvxChipSpk').textContent = String(spk);
    if (countEl) countEl.textContent = REC_ALL.length + ' 条';

    var shown = recFilter === 'all' ? REC_ALL : REC_ALL.filter(function(r){ return r.kind === recFilter; });
    var LIMIT = 8;
    var head = shown.slice(0, LIMIT);
    if (!shown.length){
      rowsHost.innerHTML = '<div class="rvx-fn" style="padding:18px 2px">还没有任何记录。做完一场模考、或在上面「添加真题成绩」里填一次，这里就有了。</div>';
      if (fnEl) fnEl.hidden = true;
      return;
    }
    rowsHost.innerHTML = head.map(function(r){
      var tagCls = r.kind === 'speaking' ? 'rvx-tag rvx-up' : 'rvx-tag';
      var tagTx  = r.kind === 'whole' ? '整卷' : (r.kind === 'part' ? '分项' : '口语模考');
      var scoreHtml = r.isPct
        ? '<span class="rvx-bar" style="width:70px;display:block;flex:none"><i style="width:' + Math.min(100, r.score) + '%;background:' + (r.score >= 80 ? 'var(--med)' : r.score >= 60 ? 'var(--warn)' : 'var(--danger)') + '"></i></span>'
          + '<b class="rvx-mono" style="font-size:13px;width:38px;text-align:right">' + r.score + '%</b>'
        : '<b class="rvx-mono" style="font-size:15px">' + (r.score == null ? '—' : one(r.score)) + '</b>';
      return '<div class="rvx-row" style="padding:11px 0;border-bottom:1px solid var(--line-soft);gap:12px">'
        + '<span class="rvx-mono" style="font-size:12.5px;color:var(--muted);width:46px;flex:none">' + esc(String(r.date || '').slice(5)) + '</span>'
        + '<span class="' + tagCls + '" style="flex:none">' + tagTx + '</span>'
        + '<span style="font-size:12.5px;color:var(--ink-2);flex:1" class="rvx-mono">' + esc(r.text) + '</span>'
        + scoreHtml + '</div>';
    }).join('');
    if (fnEl){
      var rest = shown.length - head.length;
      fnEl.hidden = rest <= 0;
      if (rest > 0) fnEl.textContent = '还有 ' + rest + ' 条。';
    }
  }

  /* ===== ⑥ 右栏：学习轨迹（热力图）/ 每天学了多久 / 口语日常练习 ===== */
  function paintRail(){
    var sess = Array.isArray(DATA.sessions) ? DATA.sessions : [];
    var byDay = {};
    sess.forEach(function(s){ if (s && s.date) byDay[s.date] = (byDay[s.date] || 0) + (s.durationSec || 0); });

    /* 学习轨迹三个数（第四个覆盖率不在口语记录里就保持 --） */
    var streak = (typeof calcStreak === 'function') ? calcStreak() : 0;
    if ($('rvxSmStreak')) $('rvxSmStreak').textContent = String(streak);
    if ($('rvxSmStreakLab')) $('rvxSmStreakLab').textContent = streak > 0 ? '连续打卡' : '连续打卡（今天还没学）';
    var active = 0;
    for (var i = 0; i < 30; i++){
      var d = new Date(); d.setDate(d.getDate() - i);
      if ((byDay[todayKey(d)] || 0) > 0) active++;
    }
    if ($('rvxSmAct')) $('rvxSmAct').innerHTML = active + '<span style="font-size:13px;font-weight:600">/30</span>';
    var totalSec = sess.reduce(function(a, s){ return a + ((s && s.durationSec) || 0); }, 0);
    if ($('rvxSmFocus')) $('rvxSmFocus').innerHTML = (totalSec >= 3600 ? (Math.round(totalSec / 360) / 10).toFixed(1) : Math.round(totalSec / 60))
      + '<span style="font-size:13px;font-weight:600">' + (totalSec >= 3600 ? 'h' : 'm') + '</span>';

    /* 热力图：与旧面板 renderHeatmap 同一套阈值（14400s = 4h 封顶） */
    var hmEl = $('rvxHm');
    if (hmEl){
      var cells = '';
      for (var k = 29; k >= 0; k--){
        var dd = new Date(); dd.setDate(dd.getDate() - k);
        var key = todayKey(dd);
        var sec = byDay[key] || 0;
        var lv = sec <= 0 ? '' : (sec < 3600 ? 'rvx-l1' : sec < 7200 ? 'rvx-l2' : 'rvx-l3');
        cells += '<i class="' + lv + '" title="' + key + ' ' + hm(sec) + '"></i>';
      }
      hmEl.innerHTML = cells;
    }

    /* 每天学了多久：按天倒序，最多 7 行（骨架里就是 7 行） */
    var daysEl = $('rvxDays');
    if (daysEl){
      var wd = ['周日','周一','周二','周三','周四','周五','周六'];
      var keys = Object.keys(byDay).filter(function(k2){ return byDay[k2] > 0; }).sort().reverse();
      if (!keys.length){
        daysEl.innerHTML = '<div class="rvx-fn" style="padding:10px 2px">还没有专注记录 —— 用站内的计时器学一会儿就会出来。</div>';
      } else {
        daysEl.innerHTML = keys.slice(0, 7).map(function(k2){
          var dt = new Date(String(k2).replace(/-/g, '/'));
          return '<div class="rvx-row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px">'
            + '<span><b class="rvx-mono">' + esc(k2.slice(5)) + '</b> <span class="rvx-muted" style="font-size:12px">' + (wd[dt.getDay()] || '') + '</span></span>'
            + '<b class="rvx-mono">' + hm(byDay[k2]) + '</b></div>';
        }).join('');
      }
      /* 说明行：与上面活跃天数同口径。
         ⚠️ 必须取 #rvxDays **后面那个** .rvx-fn —— 用 parentNode.querySelector('.rvx-fn')
            会先命中空态时我自己插进 #rvxDays 里的那条，把它的文字清空（第一版踩到）。 */
      var note = null, sib = daysEl.nextElementSibling;
      while (sib){ if (sib.classList && sib.classList.contains('rvx-fn')){ note = sib; break; } sib = sib.nextElementSibling; }
      if (note) note.textContent = keys.length ? ('共 ' + keys.length + ' 天有记录（与上面「活跃 ' + active + '/30」同口径）。') : '';
    }

    /* 口语日常练习：DATA.speakingPractice（若存在） */
    var spEl = $('rvxSpPractice');
    if (spEl){
      var sp = (DATA.speaking && Array.isArray(DATA.speaking.practice)) ? DATA.speaking.practice : [];
      spEl.textContent = sp.length ? ('已练 ' + sp.length + ' 题，最近一次 ' + esc(String((sp[sp.length - 1] || {}).date || '').slice(5)) + '。')
                                   : '还没有单题练习记录。';
    }
  }

  /* ===== 总控 ===== */
  function paintAll(){
    if (typeof DATA === 'undefined' || !DATA) return;
    try{ paintStrip(); }catch(e){ console.warn('[rvxE] 成绩条渲染失败', e); }
    try{ paintTopBar(); }catch(e){ console.warn('[rvxE] 顶部条渲染失败', e); }
    try{ paintTrend(); }catch(e){ console.warn('[rvxE] 趋势图渲染失败', e); }
    try{ paintSubjCards(); }catch(e){ console.warn('[rvxE] 科目卡渲染失败', e); }
    try{ paintRecords(); }catch(e){ console.warn('[rvxE] 全部记录渲染失败', e); }
    try{ paintRail(); }catch(e){ console.warn('[rvxE] 右栏渲染失败', e); }
  }

  /* 筛选 chip：纯前端过滤，不重算数据 */
  document.addEventListener('click', function(ev){
    /* 🔴 RV-PAGE-REDESIGN-1（10-29）：趋势图的科目筛选（终稿「一次只看一科」）。
       委托绑定 —— 软导航换 DOM 后新 chip 照样生效，不用重绑。 */
    var tc = ev.target && ev.target.closest && ev.target.closest('#rvxTrendChips [data-k]');
    if (tc){ ev.preventDefault(); setTrendPick(tc.getAttribute('data-k')); return; }
    var chip = ev.target && ev.target.closest && ev.target.closest('#rvxRecChips [data-k]');
    if (!chip) return;
    ev.preventDefault();
    recFilter = chip.getAttribute('data-k') || 'all';
    var all = document.querySelectorAll('#rvxRecChips [data-k]');
    Array.prototype.forEach.call(all, function(b){ b.classList.toggle('rvx-on', b === chip); });
    paintRecords();
  });
  /* 「去练 →」：落到对应科目（她最弱项那条） */
  document.addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest && ev.target.closest('#rvxWeakGo');
    if (!b) return;
    ev.preventDefault();
    var weak = $('rvxWeak');
    var name = weak ? weak.textContent.split('（')[0] : '';
    var map = { '听力': 'listening', '阅读': 'reading', '写作': 'writing', '口语': 'speaking' };
    var ch = map[name];
    location.href = ch === 'speaking' ? 'speaking.html'
                   : (ch ? 'bank.html?ch=' + ch : 'bank.html');
  });

  function boot(){
    paintAll();
    /* 软导航/切 tab 回来要重画（骨架是常驻 DOM，但数据可能刚变） */
    window.hubRepaintReviewE = paintAll;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  /* DATA 就绪后再画一次（data.js 是 defer，可能晚于本文件） */
  if (typeof ready === 'function') ready(function(){ paintAll(); });
})();
