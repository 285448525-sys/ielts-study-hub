/* ════════════════════════════════════════════════════════════════════
   R-REC-1 第 2 批（2026-10-25）：记录页五块接真数据
   ════════════════════════════════════════════════════════════════════
   她 16:5x「第二个页面要全部重新设计」→ 第 1 批做了结构，这批填数据。

   🔴 三条硬约束（施工书 §二 / §三）
     ① **零新存储字段**：全部从 DATA.sessions / DATA.speaking / DATA.dictationLogs /
        DATA.writing / DATA.words 现成数据算，不新增任何持久化字段。
     ② **不动旧函数**：history.js / progress.js / speaking-practice.js 一行不改；
        它们继续往旧 id 写（rvRecordStats 的五个 id 还在）。
     ③ **旧容器 id 全在**：heatmap / heatLegend / dayList / spPracticeList 保持原样。

   ⚠️ 软导航会重跑本脚本 → 每块都幂等（先查标记再绑事件，渲染纯函数随便调）。
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var $ = function(s){ return document.querySelector(s); };
  var pad2 = function(n){ return (n < 10 ? '0' : '') + n; };

  /* ─────────── ② 今天学了什么（时间线）───────────
     数据：DATA.sessions 里 date === 今天 的，按 startTs 倒序，最多 8 条。
     每条 = 时间 + 模块名 + 时长 + 一个关键数。
     ⚠️ 「关键数」不硬编：有 durationSec 就用时长；口语轮次从 DATA.speaking 练习记录里数；
        答题数这类只有模块自己知道的，就只写时长（宁可不写也不编）。 */
  function renderTimeline(){
    var host = document.querySelector('.rp-tl');
    if(!host) return;
    var today = todayKey();
    var list = (DATA.sessions || []).filter(function(s){ return s && s.date === today; })
      .slice().sort(function(a, b){ return (Number(b.startTs) || 0) - (Number(a.startTs) || 0); });
    if(!list.length){
      host.innerHTML = '<div class="rp-tl-i"><div class="rp-w">今天还没开始，先去学 20 分钟 '
        + '<a href="timer.html" style="color:var(--primary-700);font-weight:650">开始计时 →</a></div></div>';
      return;
    }
    var out = list.slice(0, 8).map(function(s, i){
      var t = s.startTs ? new Date(Number(s.startTs)) : null;
      var hhmm = t ? (pad2(t.getHours()) + ':' + pad2(t.getMinutes())) : '--:--';
      var nm = String(s.subName || '').trim() || String(s.moduleName || '').trim() || '学习';
      var mod = String(s.moduleName || '').trim();
      var sec = Number(s.durationSec) || 0;
      var dur = sec >= 3600 ? ((Math.round(sec / 360) / 10).toFixed(1) + ' 小时')
                            : (Math.round(sec / 60) + ' 分钟');
      var title = mod ? (mod + ' · ' + nm) : nm;
      return '<div class="rp-tl-i' + (i === 0 ? ' rp-today' : '') + '">'
        + '<div class="rp-t">' + hhmm + '</div>'
        + '<div class="rp-w">' + escapeHtml(title) + ' <span>' + dur + '</span></div></div>';
    }).join('');
    host.innerHTML = out;
  }

  /* ─────────── ③ 本周节奏（周历条）───────────
     数据：与热力图同一套按天聚合（byDay[date] += durationSec），取本周 7 天。
     四档：<1h / 1-2h / 2-4h / ≥4h（施工书 §三.2 明确「不要五档」）。
     点某天 → 滚到「全部记录」并筛那天。 */
  function renderWeek(){
    var host = document.querySelector('.rp-week');
    if(!host) return;
    var byDay = {};
    (DATA.sessions || []).forEach(function(s){
      if(s && s.date) byDay[s.date] = (byDay[s.date] || 0) + (Number(s.durationSec) || 0);
    });
    /* 本周 = 从本周一开始的 7 天（周一到周日；中国习惯） */
    var now = new Date();
    var dow = (now.getDay() + 6) % 7;         // 周一=0
    var monday = new Date(now.getTime() - dow * 86400e3);
    var names = ['周一','周二','周三','周四','周五','周六','周日'];
    var today = todayKey();
    var cells = [];
    for(var i = 0; i < 7; i++){
      var d = new Date(monday.getTime() + i * 86400e3);
      var key = todayKey(d);
      var sec = byDay[key] || 0;
      var h = Math.round(sec / 360) / 10;     // 1 位小数
      var lv = sec <= 0 ? '' : (h < 1 ? 'rp-l1' : (h < 2 ? 'rp-l2' : (h < 4 ? 'rp-l3' : 'rp-l4')));
      var isToday = key === today;
      cells.push('<div class="rp-wd' + (isToday ? ' rp-today' : '') + '" data-day="' + key + '">'
        + '<div class="rp-d">' + (isToday ? '今天' : names[i]) + '</div>'
        + '<div class="rp-cell ' + lv + '">' + (sec > 0 ? h.toFixed(1) : '--') + '</div></div>');
    }
    host.innerHTML = cells.join('');
    if(!host.__rvWeekBound){
      host.__rvWeekBound = true;
      host.addEventListener('click', function(ev){
        var t = ev.target;
        var wd = t && t.closest ? t.closest('[data-day]') : null;
        if(!wd) return;
        var day = wd.getAttribute('data-day');
        filterAll(day);
      });
    }
  }

  /* ─────────── ④ 全部记录（三类合一 + 筛选 + 加载更多）───────────
     三类数据源：
       · 学习时长 = DATA.sessions（每条的 subName/moduleName/durationSec/date/startTs）
       · 口语练习 = DATA.speaking 里带练习痕迹的（practiceCount/lastPractice 之类按现成口径）
       · 默写错题 = DATA.dictationLogs（每条的 text/en/createdAt）
       · 模考记录 = DATA.mockRecords（第 1 页已有，这里只让筛选能筛到）
     统一成 { date, kind, title, sub, tag } 再按日期倒序、每页 20 条。
     ⚠️ 她账号 940 条，一次全渲染会卡 → 默认 20 条 + 加载更多。 */
  var ALL = [];            // 合并后的全集
  var SHOWN = 20;          // 当前显示条数
  var FILTER = 'all';      // 当前筛选
  var DAY_FILTER = null;   // 点周历带过来的那一天

  function collectAll(){
    var out = [];
    /* ① 学习时长 */
    (DATA.sessions || []).forEach(function(s){
      if(!s || !s.date) return;
      var nm = String(s.subName || '').trim() || String(s.moduleName || '').trim() || '学习';
      var sec = Number(s.durationSec) || 0;
      var dur = sec >= 3600 ? ((Math.round(sec / 360) / 10).toFixed(1) + ' 小时') : (Math.round(sec / 60) + ' 分钟');
      var t = s.startTs ? new Date(Number(s.startTs)) : null;
      out.push({
        date: s.date, ts: Number(s.startTs) || 0, kind: 'time',
        title: (s.moduleName ? s.moduleName + ' · ' : '') + nm,
        sub: dur + (t ? (' · ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ' 开始') : ''),
        tag: '时长', tagCls: 'rp-k-time'
      });
    });
    /* ② 口语练习
       🔴 真实结构：P2 → s.answers.p2.records[]；P1 → s.answers[qi].records[]
          （js/speaking-practice.js 的 topicRecords() 就是这个口径）
          我第一版按 practiceCount / lastPractice 取 —— 这两个字段真实数据里不存在，
          结果口语记录全被过滤掉、.rp-k-sp 永远不出现（1:1 报缺失）。
       这里每条 record 单独成行，时间取 record 里的 ts / createdAt，没有就不显示这一天。 */
    (DATA.speaking || []).forEach(function(sp){
      if(!sp) return;
      var recs = [];
      if(sp.type === 'P2'){
        recs = (sp.answers && sp.answers.p2 && sp.answers.p2.records) || [];
      }else{
        var ans = sp.answers || {};
        (sp.questions || []).forEach(function(q, qi){
          var rr = (ans[qi] && ans[qi].records) || [];
          rr.forEach(function(r){ recs.push(r); });
        });
      }
      if(!recs.length) return;
      var title = String(sp.titleEn || sp.titleZh || '话题').slice(0, 40);
      recs.forEach(function(r){
        var when = Number(r.ts || r.createdAt || r.at || 0);
        if(!when) return;                              // 没有时间的旧记录不参与排序
        var d = new Date(when);
        out.push({
          date: todayKey(d), ts: when, kind: 'sp',
          title: '口语 · ' + title,
          sub: (r.part === 'P2' ? 'P2 单题练习' : 'P1 单题练习')
               + (r.band != null ? (' · 评分 ' + r.band) : ''),
          tag: '口语', tagCls: 'rp-k-sp'
        });
      });
    });
    /* ③ 默写错题 */
    (DATA.dictationLogs || []).forEach(function(l){
      if(!l) return;
      var when = Number(l.createdAt) || 0;
      var d = new Date(when || Date.now());
      out.push({
        date: todayKey(d), ts: when, kind: 'dic',
        title: '默写错题 · ' + String(l.text || l.en || '').slice(0, 30),
        sub: l.en && l.text ? String(l.en).slice(0, 40) : '记错一次',
        tag: '默写', tagCls: 'rp-k-dic'
      });
    });
    /* ④ 模考记录 */
    (DATA.mockRecords || []).forEach(function(r){
      if(!r) return;
      var when = Number(r.createdAt || r.ts || 0);
      var d = new Date(when || Date.now());
      out.push({
        date: todayKey(d), ts: when, kind: 'mock',
        title: '模考 · ' + (String(r.kind || r.module || '整卷')),
        sub: r.band != null ? ('总分 ' + r.band) : '已交卷',
        tag: '模考', tagCls: 'rp-k-mock'
      });
    });
    out.sort(function(a, b){ return (b.ts || 0) - (a.ts || 0) || String(b.date).localeCompare(String(a.date)); });
    return out;
  }

  function filterAll(day){
    if(day){ DAY_FILTER = day; }
    renderAll();
  }

  function renderAll(){
    var listHost = document.querySelector('.rp-flist');
    if(!listHost) return;
    var rows = ALL;
    if(FILTER !== 'all') rows = rows.filter(function(r){ return r.kind === FILTER; });
    if(DAY_FILTER) rows = rows.filter(function(r){ return r.date === DAY_FILTER; });
    if(!rows.length){
      listHost.innerHTML = '<div class="rp-frow-i"><span class="rp-bd"><b>还没有记录</b>'
        + '<span class="rp-sub">' + (DAY_FILTER ? '这一天没有记录' : '先去学一会儿，这里就会有') + '</span></span></div>';
      return;
    }
    var page = rows.slice(0, SHOWN);
    var more = rows.length > SHOWN;
    listHost.innerHTML = page.map(function(r){
      return '<div class="rp-frow-i">'
        + '<span class="rp-dt">' + String(r.date).slice(5) + '</span>'
        + '<span class="rp-bd"><b>' + escapeHtml(r.title) + '</b>'
        + '<span class="rp-sub">' + escapeHtml(r.sub) + '</span></span>'
        + '<span class="rp-rt"><span class="rp-tag ' + r.tagCls + '">' + r.tag + '</span></span></div>';
    }).join('')
    + (more ? '<div class="rp-frow-i" style="justify-content:center;border:0"><button class="rp-btn rp-btn-sm" id="rvLoadMore">加载更多（还有 ' + (rows.length - SHOWN) + ' 条）</button></div>' : '');
    if(DAY_FILTER){
      listHost.insertAdjacentHTML('afterbegin',
        '<div class="rp-frow-i" style="border:0;background:var(--primary-50)"><span class="rp-bd"><b>只看 '
        + DAY_FILTER + '</b></span><span class="rp-rt"><button class="rp-btn rp-btn-sm" id="rvClearDay">显示全部</button></span></div>');
    }
  }

  /* 筛选按钮：点一下切 FILTER 并重画（事件委托，幂等） */
  function bindFilters(){
    var box = document.querySelector('.rp-filters');
    if(!box || box.__rvFBound) return;
    box.__rvFBound = true;
    box.addEventListener('click', function(ev){
      var t = ev.target;
      var btn = t && t.closest ? t.closest('.rp-f') : null;
      if(!btn) return;
      var map = { '全部': 'all', '学习时长': 'time', '口语练习': 'sp', '默写错题': 'dic', '模考记录': 'mock' };
      var label = (btn.textContent || '').trim();
      FILTER = map[label] || 'all';
      DAY_FILTER = null;
      SHOWN = 20;
      Array.prototype.forEach.call(box.querySelectorAll('.rp-f'), function(b){
        b.classList.toggle('rp-on', b === btn);
      });
      renderAll();
    });
  }

  /* 列表区的「加载更多 / 显示全部」—— 委托到 document（软导航重跑也不重复绑） */
  if(!window.__rvAllClick){
    window.__rvAllClick = function(ev){
      var t = ev.target;
      if(!t || !t.closest) return;
      if(t.closest('#rvLoadMore')){ SHOWN += 20; renderAll(); return; }
      if(t.closest('#rvClearDay')){ DAY_FILTER = null; SHOWN = 20; renderAll(); return; }
    };
    document.addEventListener('click', window.__rvAllClick);
  }

  /* ─────────── ⑤ 成就 ───────────
     6 个：连续 7 天 / 背词 1000 / 首场模考 / 连续 30 天 / 口语 50 轮 / 错题清零。
     未解锁的显示「还差 N」（施工书 §三.4）。全部现成口径，不手动领、不弹窗。 */
  function renderAch(){
    var host = document.querySelector('.rp-ach');
    if(!host) return;
    var streak = (typeof calcStreak === 'function') ? calcStreak() : 0;
    var wordN = (DATA.words || []).length;
    var mockN = (DATA.mockRecords || []).length;
    /* 口语轮次 = 所有话题的 records 条数（与上面 collectAll 同一口径，别再数 practiceCount） */
    var spRounds = 0;
    (DATA.speaking || []).forEach(function(sp){
      if(!sp) return;
      if(sp.type === 'P2'){ spRounds += ((sp.answers && sp.answers.p2 && sp.answers.p2.records) || []).length; }
      else {
        var ans = sp.answers || {};
        (sp.questions || []).forEach(function(q, qi){ spRounds += ((ans[qi] && ans[qi].records) || []).length; });
      }
    });
    var wrongN = (DATA.words || []).filter(function(w){ return w && w.hardWord; }).length;
    var defs = [
      { t: '连续 7 天',  ok: streak >= 7,  left: Math.max(0, 7 - streak),  unit: '天' },
      { t: '背词 1000', ok: wordN >= 1000, left: Math.max(0, 1000 - wordN), unit: '个' },
      { t: '首场模考',  ok: mockN >= 1,    left: Math.max(0, 1 - mockN),    unit: '场' },
      { t: '连续 30 天', ok: streak >= 30, left: Math.max(0, 30 - streak), unit: '天' },
      { t: '口语 50 轮', ok: spRounds >= 50, left: Math.max(0, 50 - spRounds), unit: '轮' },
      { t: '错题清零',  ok: wrongN <= 0,   left: wrongN,                    unit: '个' }
    ];
    host.innerHTML = defs.map(function(d){
      var sub = d.ok ? '已达成' : (d.left > 0 ? ('还差 ' + d.left + ' ' + d.unit) : '还差一点');
      return '<div class="rp-ac' + (d.ok ? ' rp-on' : ' rp-lock') + '">'
        + '<span class="rp-ic">' + (d.ok ? '◆' : '◇') + '</span>'
        + '<span class="rp-tx"><b>' + d.t + '</b><span>' + sub + '</span></span></div>';
    }).join('');
  }

  /* ─────────── ⑥ 我的数据 ───────────
     三行：学习记录条数 + 导出 / 错题本条数 + 去看 / 云同步状态。
     导出复用设置页现成的导出能力（施工书 §三.5：不新写）。 */
  function renderMyData(){
    var host = document.querySelector('.rp-data');
    if(!host) return;
    var sessN = (DATA.sessions || []).length;
    var mockN = (DATA.mockRecords || []).length;
    var wordN = (DATA.words || []).length;
    var wrongN = (DATA.words || []).filter(function(w){ return w && w.hardWord; }).length;
    var dicN = (DATA.dictationLogs || []).length;
    /* AUDIT-D1-1（10-28 SSR 审计 D1-1 节）：原来只查 syncCode、不查 token，
       token 过期后这里仍显示「已绑定账号」，而顶栏/设置/会员三处都显示「未登录」→ 她点了无效。
       口径统一到全站唯一标准（与 common.js:625 头像菜单、settings.js:170 renderAuthUI 完全一致）：
         **syncCode && authToken()** 两个都成立才算已绑定。
       authToken() 自带 try/catch（common-sync.js:184），所以外面这层 try 只需兜住 DATA 为空。
       ⚠️ 反向断言：正常登录时 syncCode 与 token 同时存在 → 仍显示「已绑定账号」，不会误降级；
         正常登出 authLogout() 会同时清掉两者，也不会出现半截状态。 */
    var syncTxt = '未登录';
    try{
      if(DATA.settings && DATA.settings.syncCode
         && typeof authToken === 'function' && authToken()) syncTxt = '已绑定账号';
    }catch(e){}
    host.innerHTML =
      '<div class="rp-frow-i" style="border:0;padding:8px 0">'
      + '<span class="rp-bd"><b>学习记录</b><span class="rp-sub">' + sessN + ' 条计时 · ' + mockN + ' 场模考 · ' + wordN + ' 词</span></span>'
      + '<span class="rp-rt"><button class="rp-btn rp-btn-sm" id="rvExportData">导出</button></span></div>'
      + '<div class="rp-frow-i" style="border:0;padding:8px 0">'
      + '<span class="rp-bd"><b>错题本</b><span class="rp-sub">' + wrongN + ' 个词 · ' + dicN + ' 条默写错句</span></span>'
      + '<span class="rp-rt"><button class="rp-btn rp-btn-sm" id="rvGoWrong">去看</button></span></div>'
      + '<div class="rp-frow-i" style="border:0;padding:8px 0">'
      + '<span class="rp-bd"><b>云同步</b><span class="rp-sub">' + syncTxt + '</span></span>'
      + '<span class="rp-rt"><span class="rp-tag rp-k-time">' + (syncTxt === '未登录' ? '本地' : '正常') + '</span></span></div>';
    /* 导出：复用设置页的导出能力（exportData 在 settings.js，全站可调） */
    if(!host.__rvMyBound){
      host.__rvMyBound = true;
      host.addEventListener('click', function(ev){
        var t = ev.target;
        if(!t || !t.closest) return;
        if(t.closest('#rvExportData')){
          ev.preventDefault();
          if(typeof exportData === 'function'){
            try{ exportData(); }catch(e){ if(typeof toast === 'function') toast('导出失败，去设置页试试'); }
          }else if(typeof toast === 'function'){ toast('导出入口在设置页 · 数据备份'); }
          return;
        }
        if(t.closest('#rvGoWrong')){
          ev.preventDefault();
          if(typeof hubSoftGo === 'function') hubSoftGo('corpus.html#eb');
          else location.href = 'corpus.html#eb';
          return;
        }
      });
    }
  }

  /* ─────────── 统一入口（幂等，软导航重跑安全）─────────── */
  function renderAllPanels(){
    try{ renderTimeline(); }catch(e){}
    try{ renderWeek(); }catch(e){}
    try{ ALL = collectAll(); renderAll(); bindFilters(); }catch(e){}
    try{ renderAch(); }catch(e){}
    try{ renderMyData(); }catch(e){}
  }

  ready(renderAllPanels);
  /* 数据合并 / 切到记录页后再刷一次（DATA 可能晚到） */
  document.addEventListener('hub:data-merged', function(){ try{ renderAllPanels(); }catch(e){} });
  window.__rvRecordRefresh = renderAllPanels;
})();
