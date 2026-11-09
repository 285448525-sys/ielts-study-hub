(function(){
  'use strict';
  /* WRITING-TABS-1 任务1（11-08，她「开始做写作的设计稿页面，最好还原一些，是个大任务可以分成几次做」）
     把 design/WRITING-TABS-1-写作页侧栏各页UI样子稿-2026-11-07.html 的左栏 5 tab 与「总览」页落进真页面。
     做法沿用单词页 / 回顾页已验证的那套：
       · 不动 7 页共用的 js/hub-side-shell.js（动它要 7 页串号）；
       · 既有真实模块一个不删、ID 一个不改（#writeTabs / #tplPanel / #bankPanel / #scorePanel /
         #dictationPanel / #examPanel 及内部所有 id 全保留，js/writing.js 照常写它们）；
       · 左栏 5 tab 用属性 data-wr-tab（不是共用脚本的 data-hub-sub，避开 syncActive/onClick 误伤）；
         共用脚本 writing 分支那 3 颗旧 sub 用页内 CSS 收起（#hubSubs{display:none!important}）；
       · 数字全部现场算真字段，稿子里的示意数字一个不用，算不出留空态、不编百分比。
     5 tab 与既有面板的映射（任务1 先把壳与总览做实，模板库/语料库/AI 评分三页逐笔重皮）：
       home 总览     = 新 pane #wrPaneHome（本笔，全真数据）；
       tpl  模板库   → 转发 #writeTabs [data-tab=tpl]（switchWriteTab 显示 #tplPanel，任务2 重皮）；
       bank 语料库   → 转发 [data-tab=bank]（#bankPanel，任务3 重皮）；
       score AI 评分 → 转发 [data-tab=score]（#scorePanel，任务4 重皮）；
       records 练习记录 = 新 pane #wrPaneRecords（WRITING-VIEWS-2 已按稿补 4 数卡/记录表/走势/语法点）。
     WRITING-VIEWS-2（11-09 她「其他页面只改了骨架，把里面的内容也改成设计稿的样式」）：
       三个转发旧面板各补一段按稿栏头（真数据，见 renderViewHeads），并在 writing.html 页内 style
       按 WRITING-TABS-1 稿子就地重皮（选择器限定三个面板内，不串号全站）；练习记录栏按稿补足内容。
       既有 DOM/ID/数据落点/事件绑定一个不删不改，判分域不动。
     ⚠️ 与 js/writing.js 的 switchWriteTab 共存：它会在 ?sub= 深链、模板默写返回（:282/:1636）、
       机考记录退出（:3507/:3514）时自行显示/隐藏旧面板。本文件用 MutationObserver 盯旧面板的
       hidden：任何旧面板被显示，就把两个新 pane 收起并同步左栏高亮，保证任何时刻只有一套视图、
       绝不两层叠加。转发用 .click()（display:none 的按钮仍可程序触发，与 hub-side-shell.js 同款）。
     真字段：DATA.writingScores（result.overall / result.breakdown{TR,TA,CC,LR,GRA} /
       result.grammar[] / result.brief / mode / type / date / topic / tplTitle）、DATA.writing、
       DATA.writingPhrases、DATA.settings.targets（writing / overall）、wtMinWords()（大作文250/小作文150）。
     AI 预估分不是官方成绩：官方只有四项标准与 40 题换算，没有任何「AI 篇级评分」口径
       （调研见设计稿头注释），所以总览每处分数都标「AI 预估，不是官方成绩」。
     band 目标分用水平标尺，不是完成度百分比环（0–9 是能力量表，无分母不可算完成度）。
     软导航契约：本文件随每轮 window.eval 重跑，监听必须先 remove 再 add（bind()）。
     // TODO: [待确认] 设计稿总览「距目标写作 6」目标分口径：优先 DATA.settings.targets.writing，
       没填则回落 targets.overall，再没填按 6。若她另有口径，点头后改 target() 一处。
     // TODO: [待确认] 练习记录页「分项 40 题答对数 / 错句本」是否复用站内既有弹窗与
       collectWrongSentences()，任务5 落时再定；本笔只给真记录表，不动既有数据。 */
  var TABS=[
    {id:'home',nm:'总览',ic:'grid'},
    {id:'tpl',nm:'模板库',ic:'book'},
    {id:'bank',nm:'语料库',ic:'pen'},
    {id:'score',nm:'AI 评分',ic:'chat'},
    {id:'records',nm:'练习记录',ic:'table'},
    {id:'exam',nm:'真题模考',ic:'exam'}
  ];
  var ICON={
    grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    pen:'<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 6l3 3"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    exam:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v4h6V3M9 12h6M9 16h4"/>'
  };
  var DIM=[['TR','任务回应'],['TA','任务完成'],['CC','连贯与衔接'],['LR','词汇丰富程度'],['GRA','语法多样性及准确性']];
  var LEGACY=['tplPanel','bankPanel','scorePanel','dictationPanel'];
  var PANEL_OF={tpl:'tplPanel',bank:'bankPanel',score:'scorePanel'};
  var OBS_MAP={tplPanel:'tpl',bankPanel:'bank',scorePanel:'score',dictationPanel:'tpl'};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function $(id){return document.getElementById(id)}
  function ic(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.grid)+'</svg>'}
  function num(v){var n=Number(v);return isFinite(n)?n:null}
  function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):'—'}
  function pad2(n){return String(n).length<2?('0'+n):String(n)}
  function today(){if(typeof window.todayKey==='function'){try{return window.todayKey()}catch(e){}}var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
  function dayAdd(d,n){if(typeof window.addDays==='function'){try{return window.addDays(d,n)}catch(e){}}var dt=new Date(d+'T00:00:00');dt.setDate(dt.getDate()+n);return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate())}
  function data(){return (typeof DATA!=='undefined'&&DATA)?DATA:{}}
  function scores(){
    var a=Array.isArray(data().writingScores)?data().writingScores.slice():[];
    return a.filter(function(r){return r&&r.parsed&&r.result&&typeof r.result==='object'&&r.result.overall!=null})
            .sort(function(x,y){return String(x&&x.date||'').localeCompare(String(y&&y.date||''))});
  }
  function target(){var T=data().settings&&data().settings.targets||{};var w=parseFloat(T.writing),o=parseFloat(T.overall);if(w>0)return w;if(o>0)return o;return 6}
  function inRange(r){
    var rg=window.__wrRange||'30';if(rg==='all')return true;
    var n=Number(rg)||30,cut=dayAdd(today(),-n+1);
    return String(r&&r.date||'')>=cut;
  }
  function tplCount(){return Array.isArray(data().writing)?data().writing.length:0}
  function phrCount(){return Array.isArray(data().writingPhrases)?data().writingPhrases.length:0}
  function weakDims(r){
    if(!r||!r.result||!r.result.breakdown)return [];
    var b=r.result.breakdown,arr=[];
    DIM.forEach(function(p){var v=num(b[p[0]]);if(v!=null)arr.push({nm:p[1],k:p[0],v:v})});
    if(!arr.length)return [];
    arr.sort(function(a,c){return a.v-c.v});
    return arr.slice(0,2).map(function(x){return x.nm+'（'+x.k+'）'});
  }
  function briefOf(r){
    var b=r.result&&r.result.brief;if(b)return String(b);
    if(r.mode==='template')return r.tplTitle||'模板';
    var q=r.topic||'';if(q)return q.length>26?q.slice(0,26)+'…':q;
    return r.type||'整篇';
  }
  function modeOf(r){return r.mode==='template'?'模板评分':(r.mode==='exam'?'真题模考':'整篇评分')}

  function statHtml(cards){
    return cards.map(function(c){
      return '<div class="wr-stat'+(c.ok?' ok':'')+'"><div class="k">'+esc(c.k)+'</div>'
        +'<div class="v'+(c.tone?' '+c.tone:'')+'">'+c.v+(c.unit?'<small>'+esc(c.unit)+'</small>':'')+'</div>'
        +'<div class="d">'+esc(c.d||'')+'</div></div>';
    }).join('');
  }
  function panelHead(title,hint){return '<div class="wr-panel-h"><b>'+esc(title)+'</b>'+(hint?'<span>'+esc(hint)+'</span>':'')+'</div>'}

  function sparkHtml(recs,t){
    var W=280,H=76,P=8;
    var vals=recs.map(function(r){return Number(r.result.overall)||0});
    if(!vals.length)return '';
    var lo=Math.min.apply(null,vals.concat([t-0.5])),hi=Math.max.apply(null,vals.concat([t+0.5]));
    if(hi-lo<1){hi=lo+1}
    var X=function(i){return vals.length>1?P+i*(W-2*P)/(vals.length-1):W/2};
    var Y=function(v){return H-P-(v-lo)/(hi-lo)*(H-2*P)};
    var pts=vals.map(function(v,i){return X(i).toFixed(1)+','+Y(v).toFixed(1)}).join(' ');
    var dots=vals.map(function(v,i){return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="3.4" class="wr-line-dot"/>'}).join('');
    var gy=Y(t).toFixed(1);
    return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="写作评分走势">'
      +'<line x1="0" y1="'+gy+'" x2="'+W+'" y2="'+gy+'" class="wr-line-goal"/>'
      +'<polyline points="'+pts+'" fill="none" stroke="var(--wt-teal)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'
      +dots+'</svg>';
  }
  function rulerHtml(cur,t){
    var gp=Math.max(0,Math.min(100,t/9*100)).toFixed(1);
    var cp=cur==null?null:Math.max(0,Math.min(100,cur/9*100)).toFixed(1);
    var ticks='';for(var i=0;i<=9;i++)ticks+='<span>'+i+'</span>';
    return '<div class="wr-panel" style="margin-bottom:14px">'+panelHead('写作分与目标','水平标尺，不是完成度百分比')
      +'<div class="wr-ruler"><div class="wr-ruler-track">'
      +(cp!=null?'<i style="width:'+cp+'%"></i>':'')
      +'<span class="wr-ruler-goal" style="left:'+gp+'%"></span>'
      +(cp!=null?'<span class="wr-ruler-cur" style="left:'+cp+'%"></span>':'')
      +'</div><div class="wr-ruler-ticks">'+ticks+'</div></div></div>';
  }
  function calloutHtml(weak){
    var head=weak.length>=2?(weak[0]+' 和 '+weak[1]+' 是短板'):(weak.length===1?(weak[0]+' 是短板'):'按官方四项标准继续练');
    return '<div class="wr-callout"><span class="ic">'+ic('chat')+'</span>'
      +'<span class="tx"><b>'+esc(head)+'</b><span>先把偏低项补上，再练整套限时写作。</span></span>'
      +'<button type="button" class="wr-btn" data-wr-go="bank">去背语料</button></div>';
  }
  function renderHome(){
    var box=$('wrHomeBody');if(!box)return;
    var all=scores(),recs=all.filter(inRange),t=target();
    if(!recs.length){
      var msg=all.length?'这个时间范围里还没有评分，换到「全部时间」看看。':'还没有写作评分。先写一篇（Task 2 至少 250 词）让 AI 按官方四项估一次分，就能看见自己的起点。';
      box.innerHTML='<div class="wr-empty"><b>'+(all.length?'这个范围没有评分':'还没有写作评分')+'</b>'+esc(msg)
        +'<div style="margin-top:14px"><button type="button" class="wr-btn primary" data-wr-go="score">去写一篇</button></div></div>';
      return;
    }
    var last=recs[recs.length-1],ov=Number(last.result.overall)||0;
    var gap=Math.round((t-ov)*2)/2;
    var weak=weakDims(last);
    var cards=[
      {k:'最近一次评分',v:one(ov),unit:'/ 9',d:(last.date||'')+' · AI 预估，不是官方成绩',ok:true,tone:'teal'},
      {k:'距目标写作 '+t,v:gap>0?('差 '+gap):'已达标',d:gap>0?(weak.length?('四项里 '+weak.join('、')+' 偏低'):'再练一轮整套写作'):'已达到目标分',tone:gap>0?'warn':'teal'},
      {k:'模板 / 语料',v:String(tplCount()),unit:'套',d:phrCount()+' 条万能语料可套用'},
      {k:'已评分',v:String(recs.length),unit:'次',d:'所选时间范围内 · 累积 '+all.length+' 次'}
    ];
    var recent=recs.slice(-3).reverse();
    var recentHtml=recent.map(function(r){
      var v=Number(r.result.overall)||0,key=v>=t;
      return '<div class="wr-mini-row"><span class="grow"><span class="t">'+esc((r.date||'')+' · '+modeOf(r))+'</span>'
        +'<span class="d">'+esc(briefOf(r))+'</span></span><span class="wr-pill '+(key?'key':'warn')+'">'+esc(one(v))+'</span></div>';
    }).join('');
    var sparkFoot='<div class="wr-spark-foot"><span>'+esc((recs[0].date||'')+' · '+one(recs[0].result.overall))
      +'</span><span>'+esc((last.date||'')+' · '+one(ov))+'</span></div>';
    var twoCol='<div class="wr-two-col">'
      +'<div class="wr-panel">'+panelHead('评分走势','近 '+Math.min(recs.length,8)+' 次 · 每个点是一篇 · 虚线 = 目标 '+t)
        +'<div class="wr-spark">'+sparkHtml(recs.slice(-8),t)+sparkFoot+'</div></div>'
      +'<div class="wr-panel">'+panelHead('最近三次','AI 预估分，不是官方成绩')+recentHtml+'</div></div>';
    box.innerHTML='<div class="wr-stat-grid">'+statHtml(cards)+'</div>'
      +rulerHtml(ov,t)+calloutHtml(weak)+twoCol;
  }
  function renderViewHeads(){
    var d=data(), ph=Array.isArray(d.writingPhrases)?d.writingPhrases.length:0;
    var tpl=Array.isArray(d.writing)?d.writing.length:0, sc=scores().length;
    var vals={tpl:tpl+' 套 · '+ph+' 条语料',bank:ph+' 条 · 点中文自测',score:sc+' 次评分 · 预估分不是官方成绩'};
    document.querySelectorAll('[data-wrv-stat]').forEach(function(e){
      var k=e.getAttribute('data-wrv-stat'); if(vals[k]!=null) e.textContent=vals[k];
    });
  }
  function renderRecords(){
    /* WRITING-VIEWS-2：按 WRITING-TABS-1 稿子把练习记录栏从一张列表补成
       4 数卡 + 记录表 + 评分走势 + 常犯语法点，全部现场算真数据，不编数字。 */
    var box=$('wrRecordsBody');if(!box)return;
    var recs=scores().slice().reverse(),t=target();
    if(!recs.length){box.innerHTML='<div class="wr-empty"><b>还没有练习记录</b>写一篇让 AI 评分，或默写一套模板，记录会自动收在这里。<div style="margin-top:14px"><button type="button" class="wr-btn primary" data-wr-go="score">去写一篇</button></div></div>';return}
    var vals=recs.map(function(r){return Number(r.result.overall)||0});
    var last=vals[0], n3=Math.min(3,vals.length), avg=vals.slice(0,n3).reduce(function(a,b){return a+b},0)/n3;
    var wrong=0;try{if(typeof window.collectWrongSentences==='function'){var w=window.collectWrongSentences();wrong=Array.isArray(w)?w.length:0}}catch(e){}
    var cards=[
      {k:'近一次预估',v:one(last),unit:'/ 9',d:(recs[0].date||'')+' · AI 预估，不是官方成绩',ok:true,tone:'teal'},
      {k:'近 3 次均值',v:one(avg),d:'AI 预估分'},
      {k:'累计评分',v:String(recs.length),unit:'次',d:'按日期倒序'},
      {k:'待重默错句',v:String(wrong),unit:'条',d:wrong?('错句本里还没清'):'错句本是空的',tone:wrong?'warn':'teal'}
    ];
    var bdKeys=['TR','CC','LR','GRA'];
    function bd(r,k){var b=r.result&&r.result.breakdown;if(!b)return '—';var v=num(b[k]);return v==null?'—':one(v)}
    var rows=recs.slice(0,20).map(function(r){
      var v=r.result&&r.result.overall!=null?Number(r.result.overall):null;
      var cells=bdKeys.map(function(k){
        var x=bd(r,k);return '<td class="wr-rt-sc'+(x!=='—'&&Number(x)<t?' wr-rt-low':'')+'">'+esc(x)+'</td>';
      }).join('');
      return '<tr><td class="wr-rt-date">'+esc(r.date||'')+'</td>'
        +'<td><span class="wr-pill">'+esc(modeOf(r))+'</span></td>'
        +'<td class="wr-rt-brief">'+esc(String(briefOf(r)).slice(0,26))+'</td>'
        +cells
        +'<td class="wr-rt-overall">'+esc(v==null?'未解析':one(v))+'</td></tr>';
    }).join('');
    var table='<div class="wr-panel">'+panelHead('评分记录','AI 预估分，不是官方成绩 · 共 '+recs.length+' 次（最多显示 20 条）')
      +'<div class="wr-tbl-scroll"><table class="wr-rec-table"><thead><tr><th>日期</th><th>类型</th><th>题目</th><th>TR</th><th>CC</th><th>LR</th><th>GRA</th><th>预估总分</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<div class="wr-rec-row" style="border-top:1px solid var(--wt-line);color:var(--wt-muted);font-size:11.5px"><span>共 '+Math.min(recs.length,20)+' 条 · 按日期倒序</span></div></div>';
    var plot=recs.slice(0,Math.min(8,recs.length)).reverse();
    var tagCnt={};recs.slice(0,10).forEach(function(r){
      var g=r.result&&r.result.grammar;if(Array.isArray(g))g.forEach(function(x){if(x&&x.tag)tagCnt[x.tag]=(tagCnt[x.tag]||0)+1});
    });
    var tags=Object.keys(tagCnt).sort(function(a,b){return tagCnt[b]-tagCnt[a]}).slice(0,3);
    var gramHtml=tags.length?tags.map(function(k){
      return '<div class="wr-gram-row"><span class="grow"><span class="t">'+esc(k)+'</span></span><span class="wr-pill warn">'+tagCnt[k]+' 次</span></div>';
    }).join(''):'<div class="wr-gram-row"><span class="grow"><span class="t" style="color:var(--wt-muted);font-weight:600">还没有标出常犯的语法点</span></span></div>';
    var twoCol='<div class="wr-two-col">'
      +'<div class="wr-panel">'+panelHead('评分走势','近 '+plot.length+' 次 · 每个点是一篇 · 虚线 = 目标 '+t)
        +'<div class="wr-spark">'+sparkHtml(plot,t)
        +'<div class="wr-spark-foot"><span>'+esc((plot[0].date||'')+' · '+one(Number(plot[0].result.overall)||0))+'</span><span>'+esc((plot[plot.length-1].date||'')+' · '+one(Number(plot[plot.length-1].result.overall)||0))+'</span></div></div></div>'
      +'<div class="wr-panel">'+panelHead('常犯语法点','近 10 次评分里标得最多')+gramHtml+'</div></div>';
    box.innerHTML='<div class="wr-stat-grid">'+statHtml(cards)+'</div>'+table+twoCol;
  }
  function renderNav(){
    var box=$('wrNav');if(!box)return;
    var badges={tpl:tplCount(),bank:phrCount(),records:scores().length};
    box.innerHTML=TABS.map(function(tb){var n=badges[tb.id];
      return '<button class="hub-sub" type="button" data-wr-tab="'+tb.id+'"><span class="hub-sub-ic">'+ic(tb.ic)+'</span>'
        +'<span class="hub-sub-nm">'+esc(tb.nm)+'</span>'+(n?'<span class="hub-sub-n">'+esc(n)+'</span>':'')+'</button>'}).join('');
    var m=$('wrMobileTabs');if(m)m.innerHTML=TABS.map(function(tb){return '<button type="button" data-wr-tab="'+tb.id+'">'+esc(tb.nm)+'</button>'}).join('');
    syncActive();
  }
  function syncActive(){var cur=window.__wrCur||'home';document.querySelectorAll('[data-wr-tab]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-wr-tab')===cur)})}
  function syncBadges(){
    var badges={tpl:tplCount(),bank:phrCount(),records:scores().length};
    document.querySelectorAll('#wrNav [data-wr-tab]').forEach(function(b){
      var id=b.getAttribute('data-wr-tab'),n=badges[id],nb=b.querySelector('.hub-sub-n');
      if(n){if(!nb){nb=document.createElement('span');nb.className='hub-sub-n';b.appendChild(nb)}nb.textContent=String(n)}
      else if(nb){nb.parentNode.removeChild(nb)}
    });
  }
  function valid(id){return TABS.some(function(t){return t.id===id})}
  function renderPane(id){if(id==='home')renderHome();else if(id==='records')renderRecords();else if(id==='exam'){if(typeof window.renderExamList==='function')window.renderExamList();if(typeof window.renderWritingFullEntry==='function')window.renderWritingFullEntry()}}
  function hideNew(){var h=$('wrPaneHome'),r=$('wrPaneRecords'),e=$('wrPaneExam');if(h)h.hidden=true;if(r)r.hidden=true;if(e)e.hidden=true}
  function show(id,opts){
    if(!valid(id))return;
    window.__wrCur=id;
    if(id==='home'||id==='records'||id==='exam'){
      LEGACY.forEach(function(pid){var p=$(pid);if(p)p.hidden=true});
      var h=$('wrPaneHome'),r=$('wrPaneRecords'),e=$('wrPaneExam');
      if(h)h.hidden=(id!=='home');if(r)r.hidden=(id!=='records');if(e)e.hidden=(id!=='exam');
    }else{
      var want=PANEL_OF[id];
      var btn=document.querySelector('#writeTabs [data-tab="'+id+'"]');
      if(btn){try{btn.click()}catch(e){}}   /* 让 switchWriteTab 跑 renderList/renderBank/renderScoreHist 等副作用 */
      LEGACY.forEach(function(pid){var p=$(pid);if(p)p.hidden=(pid!==want)});
      hideNew();
    }
    syncActive();syncBadges();renderPane(id);renderViewHeads();
    try{var hm=document.querySelector('.hub-main');if(hm)hm.scrollTop=0;var main=document.querySelector('main.container');if(main)main.scrollTop=0}catch(e){}
    try{if(typeof window.hubResetPageScroll==='function')window.hubResetPageScroll();if(typeof window.hubFitPageScroll==='function')window.hubFitPageScroll()}catch(e){}
    if(!(opts&&opts.silent)){try{history.replaceState(null,'','#wr='+id)}catch(e){}}
    try{document.dispatchEvent(new CustomEvent('wr:tab',{detail:{id:id}}))}catch(e){}
  }
  function hashId(){var h=(location.hash||'').replace('#','');if(h.indexOf('wr=')===0)h=h.slice(3);return valid(h)?h:null}
  function subId(){
    try{var q=(typeof tbSubPending==='function')?String(tbSubPending('writing')||''):'';if(PANEL_OF[q])return q}catch(e){}
    try{var p=new URLSearchParams(location.search),q2=(p.get('sub')||'').toLowerCase();if(PANEL_OF[q2])return q2}catch(e){}
    return null;
  }
  function onClick(e){var t=e.target;if(!t||!t.closest)return;
    var b=t.closest('[data-wr-tab]');if(b){e.preventDefault();show(b.getAttribute('data-wr-tab'));return}
    var g=t.closest('[data-wr-go]');if(g){show(g.getAttribute('data-wr-go'))}
  }
  function onChange(e){var s=e.target;
    if(s&&s.matches&&s.matches('.wr-range')){
      window.__wrRange=s.value;
      document.querySelectorAll('.wr-range').forEach(function(x){x.value=window.__wrRange});
      if(window.__wrCur==='home')renderHome();
    }
  }
  function observe(){
    if(window.__wrObs){try{window.__wrObs.disconnect()}catch(e){}}
    var obs=new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var el=muts[i].target,id=el&&el.id;
        if(id&&OBS_MAP[id]&&!el.hidden){
          hideNew();
          if(window.__wrCur!==OBS_MAP[id]){window.__wrCur=OBS_MAP[id];syncActive()}
          break;
        }
      }
    });
    LEGACY.forEach(function(pid){var p=$(pid);if(p)obs.observe(p,{attributes:true,attributeFilter:['hidden']})});
    window.__wrObs=obs;
  }
  function bind(){
    if(window.__wrClick){try{document.removeEventListener('click',window.__wrClick)}catch(e){}}
    window.__wrClick=onClick;document.addEventListener('click',onClick);
    if(window.__wrChange){try{document.removeEventListener('change',window.__wrChange)}catch(e){}}
    window.__wrChange=onChange;document.addEventListener('change',onChange);
    if(window.__wrMerge){try{document.removeEventListener('hub:data-merged',window.__wrMerge)}catch(e){}}
    window.__wrMerge=function(){syncBadges();renderNav();renderPane(window.__wrCur||'home');renderViewHeads()};document.addEventListener('hub:data-merged',window.__wrMerge);
    if(window.__wrHash){try{window.removeEventListener('hashchange',window.__wrHash)}catch(e){}}
    window.__wrHash=function(){var id=hashId();if(id&&id!==window.__wrCur)show(id,{silent:true})};window.addEventListener('hashchange',window.__wrHash);
    observe();
  }
  function boot(){renderNav();bind();show(hashId()||subId()||'home',{silent:true});renderViewHeads()}
  window.__wrTabs={show:show,renderNav:renderNav,renderPane:renderPane,cur:function(){return window.__wrCur}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
