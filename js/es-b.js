/* 空状态 B（她 11-12 点头的定版）：六页共用一副骨架——左「一句价值 + 一个主动作」，
   右「之后这里会出现」的轻量预览；六页各说各的话。样子稿私有色值全换成站点 token，深浅两档自动跟随。
   本模块只把各页原本那张空卡「就地换成」B 卡，主动作沿用原站按钮的真实接线，
   功能节点 / 数据 / id / hidden 显隐机制一个不动。用 MutationObserver 兜住筛选切换等动态重渲染。
   es-* 为本次新增类名，全站 0 冲突、也不在 common.css 统一空态的强压名单里；零写死色值。
   外部 script[src]：软导航重 eval 时复用 window.__esB 单例，不叠加监听器。 */
(function(){
  'use strict';
  var CSS = "/* 空状态 B（她 11-12 点头的定版）：六页共用同一副骨架——左「一句价值 + 一个主动作」、\n   右「之后这里会出现」的轻量预览。样子稿私有色值全部换成站点 token，深浅两档自动跟随，零写死色值。\n   类名 es-* 为本次新增，真站无同款；组件规则一律带 .es-box 作用域，避免影响别页已有的同名类。\n   只在这些页面处于主空态时显示，功能接线沿用原站按钮。 */\n.es-box{border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:none;font-family:inherit}\n.es-b{display:grid;grid-template-columns:1fr 300px;margin:16px 22px;overflow:hidden}\n.es-box .es-ico{width:46px;height:46px;border-radius:12px;background:var(--primary-50);color:var(--primary-600);display:flex;align-items:center;justify-content:center;flex:none}\n.es-box .es-ico svg{width:24px;height:24px}\n.es-box .es-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:13px;font-weight:800;text-decoration:none;color:var(--on-primary);background:var(--primary);border:1px solid var(--primary);border-radius:10px;min-height:42px;padding:0 18px;cursor:pointer}\n.es-box .es-btn svg{width:16px;height:16px}\n.es-box .es-btn:hover{background:var(--primary-600);border-color:var(--primary-600)}\n.es-box .es-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:var(--primary-600);background:var(--primary-50);border-radius:20px;padding:4px 10px;letter-spacing:.02em}\n.es-box .es-badge svg{width:13px;height:13px}\n.es-box .es-note{display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--muted);line-height:1.7;background:var(--surface-2);border-radius:9px;padding:9px 11px;margin-top:12px}\n.es-box .es-note svg{width:14px;height:14px;flex:none;color:var(--primary-600);margin-top:1px}\n.es-box .es-pv{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}\n.es-box .es-pv-row{display:grid;grid-template-columns:78px 1fr;gap:10px;align-items:center;padding:9px 11px;border-bottom:1px solid var(--line);font-size:12px}\n.es-box .es-pv-row:last-child{border-bottom:none}\n.es-box .es-pv-row span{color:var(--muted);font-weight:700}\n.es-box .es-pv-row b{color:var(--ink-2);font-weight:600}\n/* B 卡：左价值 + 主动作 / 右预览 */\n.es-box .es-b-top{padding:30px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center}\n.es-box .es-b-top h2{font-size:21px;font-weight:800;letter-spacing:-.01em;margin:14px 0 8px;color:var(--ink)}\n.es-box .es-b-top p{font-size:13px;color:var(--muted);line-height:1.8;margin:0 0 20px;max-width:44ch}\n.es-box .es-b-side{background:var(--surface-2);border-left:1px solid var(--line);padding:22px 20px;display:flex;flex-direction:column;justify-content:center}\n.es-box .es-pv-h{font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--muted);margin-bottom:10px}\n/* 手机：预览挪到下方，单列 */\n@media(max-width:860px){\n  .es-b{margin:10px 12px;grid-template-columns:1fr}\n  .es-box .es-b-top{padding:20px 18px}\n  .es-box .es-b-side{border-left:none;border-top:1px solid var(--line);padding:16px 18px 18px}\n  .es-box .es-pv-row{grid-template-columns:70px 1fr;font-size:11.5px}\n  .es-box .es-b-top h2{font-size:18px}\n}\n/* review 空账号：原来那张 .rv2-empty.rve--hero 被整块换成 B 卡后，本页三条 :has(.rv2-empty) 判据都不再命中\n   这里照原样把三件事接住：概览外壳让位成单栏、收掉页头重复的录入按钮、空账号一律不回潮旧控件。\n   旧规则既已不命中，这里无需比它更高的特异性；末条沿用原规则的 important 口径。只 review 页用。 */\n.hub-main .rv2-summary:has(> .es-box){display:block;padding:0;margin:0;background:transparent;border:0;border-radius:0;box-shadow:none}\n.hub-main .rv2-head:has(+ .rv2-summary > .es-box) .rv2-primary{display:none}\n.hub-main:has(#rv2Summary > .es-box) :is(#rvxTrendView,#rvxTrendChips,.rv2-chart-foot,#rv2Insight,.rv2-performance,#recordFilter){display:none!important}\n.rv2-summary > .es-box{width:100%}\n";
  var CARDS = {"speaking": "<div class=\"es-b es-box\" data-es=\"speaking\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0014 0M12 18v3M9 21h6\"/></svg>首次使用</span><h2>先看看自己现在能说成什么样</h2><p>做一次完整模考（P1 → P2 → P3，约 12 分钟），AI 按官方四项估一次分，起点就出来了。</p><button class=\"es-btn\" data-spt-mock type=\"button\">开始一次模考 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></button></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>Part 1</span><b>家乡 / 日常习惯</b></div><div class=\"es-pv-row\"><span>Part 2</span><b>1 分钟准备 · 2 分钟说</b></div><div class=\"es-pv-row\"><span>Part 3</span><b>顺着答案再追问</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>模考记录、四项分数、逐题建议都会收在「模考记录」里，下次打开就能接着看。</span></div></div></div>", "writing": "<div class=\"es-b es-box\" data-es=\"writing\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2 2 0 013 3L8 18l-4 1 1-4z\"/></svg>首次使用</span><h2>先写一篇，才知道差在哪</h2><p>Task 2 至少 250 词，AI 按官方四项估一次分，扣分的点会逐条标出来。</p><button class=\"es-btn\" data-wr-go=\"score\" type=\"button\">去写一篇 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></button></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>Task 2</span><b>250 词以上 · 40 分钟</b></div><div class=\"es-pv-row\"><span>四项分</span><b>任务完成 / 连贯 / 词汇 / 语法</b></div><div class=\"es-pv-row\"><span>逐句批改</span><b>哪里空、哪里偏、怎么改</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>范文和模板都在左边「模板库」「语料库」里，先写再对照，记得更牢。</span></div></div></div>", "review": "<div class=\"es-b es-box\" data-es=\"review\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 19V5M4 19h16\"/><path d=\"M7 15l4-4 3 2 5-6\"/></svg>首次使用</span><h2>从最近一次分数开始记</h2><p>录一次真题或模考成绩，趋势线、四科强弱、学习天数会慢慢长出来；不用补齐历史。</p><button class=\"es-btn\" data-rv2-add type=\"button\">录入成绩 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></button></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>最近一次</span><b>总分 / 四科</b></div><div class=\"es-pv-row\"><span>两次以后</span><b>成绩趋势线</b></div><div class=\"es-pv-row\"><span>每天</span><b>学习投入自动累计</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>真题、模考和手动录入都会计入，按日期排好，后面不用再整理。</span></div></div></div>", "errorbook": "<div class=\"es-b es-box\" data-es=\"errorbook\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 10h6M9 14h6\"/></svg>首次使用</span><h2>把一道没看懂的题收进来</h2><p>整段贴进上面的框，AI 拆出句子结构、标出考点，答错的原因会留在这里反复回看。</p><button class=\"es-btn\" data-es-focus=\"ebInput\" type=\"button\">AI 收录错题 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></button></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>贴原题</span><b>题目 / 选项 / 你的答案 / 正确答案</b></div><div class=\"es-pv-row\"><span>自动拆</span><b>长难句结构 + 关键同替</b></div><div class=\"es-pv-row\"><span>进复习</span><b>归入未掌握，隔天再考</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>错词、长难句、同义替换都在左边分好了栏目，收录时自动归位。</span></div></div></div>", "teacher": "<div class=\"es-b es-box\" data-es=\"teacher\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"10\" width=\"16\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 018 0v3\"/></svg>需要权限</span><h2>这一页只给机构教师</h2><p>这里看的是班级学生的练习与成绩数据，要用有教师权限的账号登录；普通备考账号看不到，也不会显示学生信息。</p><a class=\"es-btn\" href=\"login.html\">去登录 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></a></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>登录后</span><b>按班级看练习进度</b></div><div class=\"es-pv-row\"><span>数据</span><b>成绩 / 错题 / 学习天数</b></div><div class=\"es-pv-row\"><span>隐私</span><b>仅该机构可见</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>你是考生的话，直接回首页就行，这里是给老师用的另一套页面。</span></div></div></div>", "announce": "<div class=\"es-b es-box\" data-es=\"announce\"><div class=\"es-b-top\"><span class=\"es-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/></svg>没有新内容</span><h2>目前没有需要读的新公告</h2><p>站点更新都记在下面。读过的不打扰，有重要改动才会在顶栏提醒你一次。</p><a class=\"es-btn\" href=\"home.html\">回首页继续学 <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h13M13 6l6 6-6 6\"/></svg></a></div><div class=\"es-b-side\"><div class=\"es-pv-h\">之后这里会出现</div><div class=\"es-pv\"><div class=\"es-pv-row\"><span>更新日志</span><b>按日期排，最新在最上</b></div><div class=\"es-pv-row\"><span>新消息</span><b>只提醒一次</b></div><div class=\"es-pv-row\"><span>旧公告</span><b>随时能翻回去看</b></div></div><div class=\"es-note\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 12l5 5L20 6\"/></svg><span>这一页不是「没东西」，是「都读过了」。下面仍是完整的更新记录。</span></div></div></div>"};
  if (window.__esB) { window.__esB.upgrade(); return; }   // 软导航重跑：复用单例，立即换一次卡

  function installStyle(){
    if (document.getElementById('esBStyle') || !document.head) return;
    var st = document.createElement('style');
    st.id = 'esBStyle'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // 按 DOM 特征判页（不依赖软导航 URL 一致性）：六页空态选择器互不重叠。
  var SEL = {
    speaking : '.spt-empty',
    writing  : '.wr-empty',
    review   : '#rv2Summary > .rv2-empty.rve--hero',
    errorbook: '#empty.kc-cc-empty',
    teacher  : '.tch-state'
  };
  /* 只换「空账号首屏」那一张：切时间范围后原站会另给一句「这个范围里还没有…」，
     那是筛选提示而非空账号，照留不动；teacher 的另两态（无权限 / 未绑定学生）同理照留。 */
  var GUARD = {
    speaking : function(el){ var b=el.querySelector('b'); return !!b && b.textContent.indexOf('还没有口语模考成绩')===0; },
    writing  : function(el){ var b=el.querySelector('b'); return !!b && b.textContent.indexOf('还没有写作评分')===0; },
    review   : function(){ return true; },
    teacher  : function(el){ return !!el.querySelector('a[href="login.html"]'); }
  };
  function mkCard(page){
    var t = document.createElement('div'); t.innerHTML = CARDS[page];
    return t.firstElementChild;
  }
  function wireFocus(host){                          // 错题本：主动作引导先贴题
    var btn = host.querySelector('[data-es-focus]');
    if (!btn || btn.getAttribute('data-es-wired') === '1') return;
    btn.setAttribute('data-es-wired', '1');
    btn.addEventListener('click', function(){
      var el = document.getElementById(btn.getAttribute('data-es-focus'));
      if (!el) return;
      try { el.scrollIntoView({ behavior:'smooth', block:'center' }); } catch (e) { el.scrollIntoView(); }
      el.focus();
    });
  }
  function swap(page, el){
    var card = mkCard(page); if (!card) return;
    card.setAttribute('data-es-b', '1');
    if (el.hasAttribute('hidden')) card.setAttribute('hidden', '');  // 沿用原 hidden 属性，不把藏写死在 CSS
    if (el.parentNode) el.parentNode.replaceChild(card, el);
  }

  function upgrade(){
    installStyle();                                   // 软导航可能重建过 head，每次补注入
    // 五张「整卡就地替换」：只换没标记过的节点，动态重渲染出来的新空态由 observer 再兜一次
    for (var page in SEL) {
      if (page === 'errorbook') continue;
      var els = document.querySelectorAll(SEL[page]);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.getAttribute('data-es-b') === '1') continue;
        if (GUARD[page] && !GUARD[page](el)) continue;                    // 只换空账号首屏那一张
        swap(page, el);
      }
    }
    // 错题本：保留 #empty 节点本身与 hidden 显隐（corpus.js 仍按 id 翻 hidden），
    // 只把节点变成 B 卡：去掉会被 common.css 强压的 kc-cc-empty 类，换内容与类名。
    var ebs = document.querySelectorAll(SEL.errorbook);
    for (var j = 0; j < ebs.length; j++) {
      var em = ebs[j];
      if (em.getAttribute('data-es-b') === '1') continue;
      var c = mkCard('errorbook'); if (!c) continue;
      em.classList.remove('kc-cc-empty');
      em.className = c.className;                       // 直接换成 B 卡类名，彻底离场强压名单
      em.setAttribute('data-es', 'errorbook');
      em.setAttribute('data-es-b', '1');
      em.innerHTML = c.innerHTML;
      wireFocus(em);
    }
    // 公告页没有「空卡」：把 B 卡作为长期简介插在更新日志列表最前，下面真实公告一字不动。
    var list = document.getElementById('ancList');
    if (list && list.parentNode && !document.querySelector('.es-box[data-es="announce"]')) {
      var t2 = document.createElement('div'); t2.innerHTML = CARDS.announce;
      var node = t2.firstElementChild;
      if (node) { node.setAttribute('data-es-b', '1'); list.parentNode.insertBefore(node, list); }
    }
  }

  var scheduled = false;
  function schedule(){
    if (scheduled) return; scheduled = true;
    var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
    raf(function(){ scheduled = false; try { upgrade(); } catch (e) {} });
  }
  try {
    var mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList:true, subtree:true });
  } catch (e) {}
  window.__esB = { upgrade: upgrade, schedule: schedule };
  upgrade();                                                   // 首屏立即兜一次
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', schedule, { once:true });
  window.addEventListener('load', schedule, { once:true });
})();
