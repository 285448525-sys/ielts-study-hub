(function(){
  'use strict';
  /* CORPUS-TABS-1（11-08，她「之前不是有一个句子的设计方案吗，直接落地吧」）：
     把 design/CORPUS-TABS-1-句子页侧栏各页UI样子稿-2026-11-08.html 的左栏 5 tab
     与「总览」页落进真页面，跟回顾/单词/写作/口语那 4 页同一套做法（已点头验收）。
     · 不动 7 页共用的 js/hub-side-shell.js（动它要 7 页串号）；
     · 既有 3 个真实视图 #lsView/#ebView/#dictView 与 #wordTabs 一个不删、ID 一个不改，
       js/corpus.js 照常写它们；桌面 ≥861 隐藏 #wordTabs 是她 10-23 拍的版，不回退；
     · 左栏 5 tab 用属性 data-cp-tab（不是共用脚本的 data-hub-sub，避开 syncActive/onClick 误伤）；
       共用脚本 corpus 分支那 3 颗旧 sub 用页内 CSS #hubSubs{display:none!important} 收起；
     · 新组件统一 .cp2- 前缀（避开 corpus.html 既有的 cp-search、kc、lsr、cc、eb 各类名）；
     · 桌面左栏 5 tab + 手机顶部横排 5 tab（同写作 v823 口径，手机不推翻全站壳）。
     5 tab 与既有视图的映射：
       home   总览     = 新 pane #cpPaneHome（本笔，全真数据）；
       long   长难句   → 转发 #wordTabs [data-sub=ls]（显示 #lsView）；
       errors 错题本   → 转发 [data-sub=eb]（显示 #ebView）；
       bank   句子库   → 转发 [data-sub=dict] + 显示 #cpBankSection、隐藏 #cpDictExercise；
       dict   听写默写 → 转发 [data-sub=dict] + 显示 #cpDictExercise、隐藏 #cpBankSection。
     ⚠️ 句子库独立成页（设计稿口径「句子库从原听写页里独立成页 / 材料归句子库」）：
       corpus.html 里 #dictView 下原本「练法两张卡 + 句子库 section + #dictArea」挤在一页，
       本笔只把那张「我的句子库」section（含 #corpusCount/#corpusList/#addPanel 等）拆成
       #cpBankSection、其余两块包成 #cpDictExercise，由 show() 控制显隐；DOM 与 ID 一个没删，
       js/corpus.js 的 renderList()/openAddPanel()/startWrite()/startDict() 全部照常工作。
     ⚠️ 转发必须用 .click() 让 js/corpus.js:752 switchCorpusSub 整段副作用跑
       （切 hidden + renderHistory/renderList），不能只改 hidden；转发后本文件只收起新 pane。
     ⚠️ 时序：corpus.js ready 会读 #eb / ?sub= / tbSubPending('corpus') 深链并 setTimeout(0)
       切分栏。本文件 boot() 遇既有直达参数（#eb / ?sub=）不强制切 home，让既有流程主导，
       只挂 nav/observer 并同步高亮；MutationObserver 盯 3 个 view 的 hidden，任何 view 被
       显示（#eb 深链 / 退出默写）就收起新 pane + 同步高亮，绝不两层叠加或空白。
     真字段（设计稿头注释已核）：DATA.corpus[{id,en,cn}]、DATA.longSent[{id,sentence,result,ts}]、
       DATA.errorbook[{id,known,date,...}]、DATA.dictationLogs[{sourceId,title,date,mistakes}]、
       DATA.settings.corpusCfg{rate,repeat,intervalMs,showCn,batchSize}。
     数字全部现场算真字段，稿内示意数字一个不用，算不出留空态、不编百分比；
     近 7 天按天计数柱，没练的天留空不补零（Anki 口径，设计稿已核）。
     软导航契约：本文件随每轮 window.eval 重跑，监听必须先 remove 再 add（bind()）。
     // TODO: [待确认] 近 7 天练习次数按哪几类记录计数（本笔按拆解 ts + 默写日志 date +
       错题 date 三类都算）；她若另有口径，改 byDay() 一处。
     // TODO: [待确认] 设计稿「练习设置」5 项与「默写记录」在真页面沿用既有入口
       （startWrite/startDict 弹出的 #dictArea 内设置与历史），本笔不另造第二套设置 UI；
       长难句/错题/句子库/听写默写四页的进一步精致化留后续几笔（同批拆笔口径）。 */
  var TABS=[
    {id:'home',nm:'总览',ic:'grid'},
    {id:'long',nm:'长难句',ic:'lines'},
    {id:'errors',nm:'错题本',ic:'warn'},
    {id:'bank',nm:'句子库',ic:'book'},
    {id:'dict',nm:'听写默写',ic:'mic'}
  ];
  var ICON={
    grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    lines:'<path d="M4 6.5h16M4 11.5h16M4 16.5h9"/>',
    warn:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5M12 17h.01"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    mic:'<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  var VIEWS=['lsView','ebView','dictView'];
  var OBS_MAP={lsView:'long',ebView:'errors',dictView:'dict'};
  var SUB_OF={long:'ls',errors:'eb',bank:'dict',dict:'dict'};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function $(id){return document.getElementById(id)}
  function ic(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.grid)+'</svg>'}
  function pad2(n){return String(n).length<2?('0'+n):String(n)}
  function today(){if(typeof window.todayKey==='function'){try{return window.todayKey()}catch(e){}}var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
  function dayAdd(d,n){if(typeof window.addDays==='function'){try{return window.addDays(d,n)}catch(e){}}var dt=new Date(d+'T00:00:00');dt.setDate(dt.getDate()+n);return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate())}
  function data(){return (typeof DATA!=='undefined'&&DATA)?DATA:{}}
  function arr(k){var a=data()[k];return Array.isArray(a)?a:[]}
  function dateOf(x){var d=String((x&&(x.date||x.ts))||'');if(/^\d{4}-\d{2}-\d{2}/.test(d))return d.slice(0,10);var t=Number(x&&x.ts);if(isFinite(t)&&t>0){var q=new Date(t);return q.getFullYear()+'-'+pad2(q.getMonth()+1)+'-'+pad2(q.getDate())}return ''}
  function inRange(d){var rg=window.__cpRange||'30';if(rg==='all')return true;var n=Number(rg)||30;return d&&d>=dayAdd(today(),-n+1)}
  function cntErr(){var a=arr('errorbook');return {open:a.filter(function(e){return e&&!e.known}).length,known:a.filter(function(e){return e&&e.known}).length}}
  function lastDictDate(){var a=arr('dictationLogs'),d='';a.forEach(function(x){var k=dateOf(x);if(k&&k>d)d=k});return d}
  function byDay(){
    var m={};
    arr('longSent').forEach(function(x){var d=dateOf(x);if(d)m[d]=(m[d]||0)+1});
    arr('errorbook').forEach(function(x){var d=dateOf(x);if(d)m[d]=(m[d]||0)+1});
    arr('dictationLogs').forEach(function(x){var d=dateOf(x);if(d)m[d]=(m[d]||0)+1});
    return m;
  }
  function recent(){
    var out=[];
    arr('longSent').forEach(function(x){var d=dateOf(x);out.push({d:d,kind:'拆解',t:String(x&&x.sentence||'').slice(0,42),sub:'结构拆解'})});
    arr('errorbook').forEach(function(x){var d=dateOf(x);out.push({d:d,kind:'错题',t:String(x&&(x.title||x.qtype||x.raw)||'错题收录').slice(0,42),sub:(x&&x.known)?'已掌握':'未掌握'})});
    arr('dictationLogs').forEach(function(x){var d=dateOf(x);var n=(x&&x.mistakes&&x.mistakes.length)||0;out.push({d:d,kind:'默写',t:String(x&&x.title||'语料库表格默写').slice(0,42),sub:'错 '+n+' 处'})});
    out.sort(function(a,b){return b.d.localeCompare(a.d)});
    return out.filter(function(x){return x.d}).slice(0,4);
  }

  function statHtml(cards){
    return cards.map(function(c){
      return '<div class="cp2-stat'+(c.ok?' ok':'')+'"><div class="k">'+esc(c.k)+'</div>'
        +'<div class="v'+(c.tone?' '+c.tone:'')+'">'+c.v+(c.unit?'<small>'+esc(c.unit)+'</small>':'')+'</div>'
        +'<div class="d">'+esc(c.d||'')+'</div></div>';
    }).join('');
  }
  function panelHead(title,hint){return '<div class="cp2-panel-h"><b>'+esc(title)+'</b>'+(hint?'<span>'+esc(hint)+'</span>':'')+'</div>'}
  function pill(kind){return '<span class="cp2-pill '+({'拆解':'key','错题':'warn','默写':'cur'}[kind]||'')+'">'+esc(kind)+'</span>'}

  function renderHome(){
    var box=$('cpHomeBody');if(!box)return;
    var cor=arr('corpus').length,ls=arr('longSent').length,er=cntErr(),dl=arr('dictationLogs').length,ld=lastDictDate();
    var m=byDay(),tk=today(),vals=[],max=1;
    for(var j=6;j>=0;j--){var d=dayAdd(tk,-j),v=m[d]||0;vals.push([d,v]);if(v>max)max=v}
    var labs=['','','','','','','今天'];
    var bars='',bls='';
    vals.forEach(function(p,i){
      bars+='<div class="cp2-bar'+(p[1]===0?' zero':'')+(i===6?' today':'')+'"><i style="height:'+(p[1]?Math.round(p[1]/max*84):6)+'px"></i></div>';
      bls+='<span>'+(i===6?'今天':(labs[i]||p[0].slice(5)))+'</span>';
    });
    var rec=recent();
    var rows=rec.map(function(x){return '<div class="cp2-mini-row">'+pill(x.kind)
      +'<span class="grow"><span class="t">'+esc(x.t||'—')+'</span><span class="d">'+esc(x.d.slice(5)+' · '+x.sub)+'</span></span></div>'}).join('');
    var callout='';
    if(er.open){callout='<div class="cp2-callout"><span class="ic">'+ic('warn')+'</span>'
      +'<span class="tx"><b>还有 '+er.open+' 条错题没掌握</b><span>错题收录后会留在这里，标一次「已掌握」就收起来</span></span>'
      +'<button type="button" class="cp2-btn" data-cp-go="errors">去整理</button></div>'}
    var empty=rec.length?'':'<div class="cp2-empty"><b>还没有练习记录</b>先贴一句读不懂的长难句，拆完就会记在这里。'
      +'<div style="margin-top:12px"><button type="button" class="cp2-btn primary" data-cp-go="long">去拆一句</button></div></div>';
    box.innerHTML='<div class="cp2-stat-grid">'+statHtml([
      {k:'句子库',v:String(cor),unit:'条',d:'可用来默写/听写',ok:true,tone:'teal'},
      {k:'拆解记录',v:String(ls),unit:'条',d:'AI 拆过的长难句'},
      {k:'未掌握错题',v:String(er.open),unit:'条',d:'已掌握 '+er.known+' 条',tone:er.open?'warn':''},
      {k:'累计默写',v:String(dl),unit:'次',d:ld?('最近 '+ld.slice(5)):'还没有记录'}
    ])+'</div>'+callout
      +'<div class="cp2-two-col"><div class="cp2-panel">'+panelHead('近 7 天练习','按天计数 · 没练的天留空，不连成曲线')
      +'<div class="cp2-bars">'+bars+'</div><div class="cp2-bar-labels">'+bls+'</div></div>'
      +'<div class="cp2-panel">'+panelHead('最近记录','拆解 / 错题 / 默写')+rows+'</div></div>'+empty;
  }

  function renderNav(){
    var box=$('cpNav');if(!box)return;
    var badges={long:arr('longSent').length,errors:cntErr().open,bank:arr('corpus').length,dict:arr('dictationLogs').length};
    box.innerHTML=TABS.map(function(t){var n=badges[t.id];
      return '<button class="hub-sub" type="button" data-cp-tab="'+t.id+'"><span class="hub-sub-ic">'+ic(t.ic)+'</span>'
        +'<span class="hub-sub-nm">'+esc(t.nm)+'</span>'+(n?'<span class="hub-sub-n">'+esc(n)+'</span>':'')+'</button>'}).join('');
    var m=$('cpMobileTabs');if(m)m.innerHTML=TABS.map(function(t){return '<button type="button" data-cp-tab="'+t.id+'">'+esc(t.nm)+'</button>'}).join('');
    syncActive();
  }
  function syncActive(){var cur=window.__cpCur||'home';document.querySelectorAll('[data-cp-tab]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-cp-tab')===cur)})}
  function syncBadges(){
    var badges={long:arr('longSent').length,errors:cntErr().open,bank:arr('corpus').length,dict:arr('dictationLogs').length};
    document.querySelectorAll('#cpNav [data-cp-tab]').forEach(function(b){
      var id=b.getAttribute('data-cp-tab'),n=badges[id],nb=b.querySelector('.hub-sub-n');
      if(n){if(!nb){nb=document.createElement('span');nb.className='hub-sub-n';b.appendChild(nb)}nb.textContent=String(n)}
      else if(nb){nb.parentNode.removeChild(nb)}
    });
  }
  function valid(id){return TABS.some(function(t){return t.id===id})}
  function renderPane(id){if(id==='home')renderHome()}
  function hideNew(){var h=$('cpPaneHome');if(h)h.hidden=true}
  /* 句子库 / 听写默写同在 #dictView：按 tab 显隐两块，DOM/ID 一个不删 */
  function splitDictView(id){
    var b=$('cpBankSection'),e=$('cpDictExercise');
    if(!b||!e)return;
    b.hidden=(id!=='bank');e.hidden=(id!=='dict');
  }
  function show(id,opts){
    if(!valid(id))return;
    window.__cpCur=id;
    if(id==='home'){
      VIEWS.forEach(function(v){var e=$(v);if(e)e.hidden=true});
      var h=$('cpPaneHome');if(h)h.hidden=false;
    }else{
      var sub=SUB_OF[id];
      var btn=document.querySelector('#wordTabs [data-sub="'+sub+'"]');
      if(btn){try{btn.click()}catch(e){}}   /* 让 corpus.js:752 整段副作用跑 */
      hideNew();
      splitDictView(id);
      /* 用户点原生 #wordTabs 到 dict 时，默认停「听写默写」 */
      if(id==='bank'||id==='dict')window.__cpCur=id;
    }
    syncActive();syncBadges();renderPane(id);
    try{var hm=document.querySelector('.hub-main');if(hm)hm.scrollTop=0;var main=document.querySelector('main.container');if(main)main.scrollTop=0}catch(e){}
    try{if(typeof window.hubResetPageScroll==='function')window.hubResetPageScroll();if(typeof window.hubFitPageScroll==='function')window.hubFitPageScroll()}catch(e){}
    if(!(opts&&opts.silent)){try{history.replaceState(null,'','#cp='+id)}catch(e){}}
    try{document.dispatchEvent(new CustomEvent('cp:tab',{detail:{id:id}}))}catch(e){}
  }
  function hashId(){var h=(location.hash||'').replace('#','');if(h.indexOf('cp=')===0)h=h.slice(3);return valid(h)?h:null}
  function hasDeep(){
    try{var q=new URLSearchParams(location.search);return !!(q.get('sub')||location.hash==='#eb')}catch(e){return false}
  }
  function onClick(e){var t=e.target;if(!t||!t.closest)return;
    var b=t.closest('[data-cp-tab]');if(b){e.preventDefault();show(b.getAttribute('data-cp-tab'));return}
    var g=t.closest('[data-cp-go]');if(g){show(g.getAttribute('data-cp-go'));return}
  }
  function onChange(e){var s=e.target;
    if(s&&s.matches&&s.matches('.cp2-range')){
      window.__cpRange=s.value;
      document.querySelectorAll('.cp2-range').forEach(function(x){x.value=window.__cpRange});
      if(window.__cpCur==='home')renderHome();
    }
  }
  function observe(){
    if(window.__cpObs){try{window.__cpObs.disconnect()}catch(e){}}
    var obs=new MutationObserver(function(muts){
      /* 任一既有 view 被显示（#eb 深链 / 用户点原生 tab / 退出默写）→ 收起新 pane + 同步高亮 */
      var shown=null;
      for(var i=0;i<muts.length;i++){
        var el=muts[i].target,id=el&&el.id;
        if(id&&OBS_MAP[id]&&!el.hidden){shown=id;break}
      }
      if(shown){
        hideNew();
        var want=OBS_MAP[shown];
        /* dictView 被原生切到时归到「听写默写」，除非当前本就是句子库 */
        if(want==='dict'&&window.__cpCur==='bank')want='bank';
        /* 原生 #wordTabs（手机可见）被点 → 同步两个子块的显隐，避免两块同时出现 */
        if(want==='bank'||want==='dict')splitDictView(want);
        if(window.__cpCur!==want){window.__cpCur=want;syncActive()}
        return;
      }
      /* 3 个 view 全被收起（例如本文件刚把 home 显示）→ 不动 */
    });
    VIEWS.forEach(function(v){var e=$(v);if(e)obs.observe(e,{attributes:true,attributeFilter:['hidden']})});
    window.__cpObs=obs;
  }
  function bind(){
    if(window.__cpClick){try{document.removeEventListener('click',window.__cpClick)}catch(e){}}
    window.__cpClick=onClick;document.addEventListener('click',onClick);
    if(window.__cpChange){try{document.removeEventListener('change',window.__cpChange)}catch(e){}}
    window.__cpChange=onChange;document.addEventListener('change',onChange);
    if(window.__cpMerge){try{document.removeEventListener('hub:data-merged',window.__cpMerge)}catch(e){}}
    window.__cpMerge=function(){syncBadges();renderNav();renderPane(window.__cpCur||'home')};document.addEventListener('hub:data-merged',window.__cpMerge);
    if(window.__cpHash){try{window.removeEventListener('hashchange',window.__cpHash)}catch(e){}}
    window.__cpHash=function(){var id=hashId();if(id&&id!==window.__cpCur)show(id,{silent:true})};window.addEventListener('hashchange',window.__cpHash);
    observe();
  }
  function boot(){
    renderNav();bind();
    var h=hashId();
    if(h){show(h,{silent:true});return}
    if(hasDeep()){window.__cpCur='long';syncActive();syncBadges();splitDictView('dict');return}
    show('home',{silent:true});
  }
  window.__cpTabs={show:show,renderNav:renderNav,renderPane:renderPane,cur:function(){return window.__cpCur}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
