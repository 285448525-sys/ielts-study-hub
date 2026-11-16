(function(){
  'use strict';
  /* WRITING-HUB-4（11-16，按她点头的 design/UI-SURVEY-1115/写作-成品框架-1116.html 的任务组织落真页面）
     把写作页收成四格「题库 / 模板 / 语料 / 记录」，默认题库，不做总览。
     做法沿用单词页 / 回顾页已验证的那套：
       · 不动 7 页共用的 js/hub-side-shell.js（动它要 7 页串号）；
       · 既有真实模块一个不删、ID 一个不改（#writeTabs / #tplPanel / #bankPanel / #scorePanel /
         #dictationPanel / #examPanel 及内部所有 id 全保留，js/writing.js 照常写它们）；
       · 左栏 4 tab 用属性 data-wr-tab（不是共用脚本的 data-hub-sub，避开 syncActive/onClick 误伤）；
         共用脚本 writing 分支那 3 颗旧 sub 用页内 CSS 收起（#hubSubs{display:none!important}）；
       · 数字全部现场算真字段，稿子里的示意数字一个不用，算不出留空态、不编百分比。
     4 tab 与既有面板的映射：
       exam 题库 → 新列表 #wrQList，点击仍走 js/writing.js 的 openExam()；
       tpl 模板 → 转发 #writeTabs [data-tab=tpl]（#tplPanel，保留填空/默写/AI评分）；
       bank 语料 → 转发 [data-tab=bank]（#bankPanel，保留新增/AI导入/删除）；
       records 记录 = 新 pane #wrPaneRecords，真数据汇总 + 可点回看。
     分开粘贴评分的 #scorePanel 不再占侧栏，从记录页「粘贴评分」进入，原功能不删。
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
     // TODO: [待确认] 分项 40 题答对数的统计口径另议。 */
  var TABS=[
    {id:'exam',nm:'题库',ic:'exam'},
    {id:'tpl',nm:'模板',ic:'book'},
    {id:'bank',nm:'语料',ic:'layers'},
    {id:'records',nm:'记录',ic:'table'}
  ];
  var ICON={
    grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    pen:'<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 6l3 3"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    exam:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v4h6V3M9 12h6M9 16h4"/>',
    arrow:'<path d="m9 6 6 6-6 6"/>'
  };
  var DIM=[['TR','任务回应'],['TA','任务完成'],['CC','连贯与衔接'],['LR','词汇丰富程度'],['GRA','语法多样性及准确性']];
  var LEGACY=['tplPanel','bankPanel','scorePanel','dictationPanel'];
  var PANEL_OF={tpl:'tplPanel',bank:'bankPanel',score:'scorePanel'};
  var OBS_MAP={tplPanel:'tpl',bankPanel:'bank',scorePanel:'score',dictationPanel:'tpl'};
  var bankKind='big',bankSub='all',bankQuery='',recordRefs=[],recordReturn=false,lastMain='exam',tplTask='all',tplCat='all',tplLevel='all',tplFilterReady=false,tplFilterSyncing=false;

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
  function promptData(){
    return window.WRITING_PROMPTS && typeof window.WRITING_PROMPTS==='object'
      ? window.WRITING_PROMPTS : {big:[],small:[]};
  }
  function tplItems(){var d=data();return Array.isArray(d.writing)?d.writing:[]}
  function tplIsBig(it){var c=String(it&&it.category||'');return ['动态图','静态图','地图题','流程图'].indexOf(c)<0}
  function syncTplDropdowns(){
    if(tplFilterSyncing)return;
    tplFilterSyncing=true;
    var task=$('wrTplTask'),cat=$('wrTplCat'),lv=$('wrTplLevel');if(!task||!cat||!lv)return;
    var oldTask=tplTask,oldCat=tplCat,oldLevel=tplLevel;
    task.value=oldTask;
    var cats=[];
    tplItems().filter(function(it){return tplTask==='all'||(tplTask==='big'?tplIsBig(it):!tplIsBig(it))}).forEach(function(it){var c=String(it.category||'');if(c&&cats.indexOf(c)<0)cats.push(c)});
    if(cats.indexOf(tplCat)<0)tplCat='all';
    cat.innerHTML='<option value="all">题型</option>'+cats.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>'}).join('');
    cat.value=tplCat;
    var lvs=[];
    tplItems().filter(function(it){return (tplTask==='all'||(tplTask==='big'?tplIsBig(it):!tplIsBig(it)))&&(tplCat==='all'||String(it.category||'')===tplCat)}).forEach(function(it){var l=String(it.level||'5.5');if(lvs.indexOf(l)<0)lvs.push(l)});
    lvs.sort(function(a,b){return parseFloat(a)-parseFloat(b)});
    if(lvs.indexOf(tplLevel)<0)tplLevel='all';
    lv.innerHTML='<option value="all">目标分</option>'+lvs.map(function(l){return '<option value="'+esc(l)+'">'+esc(l)+'</option>'}).join('');
    lv.value=tplLevel;
    if(oldCat!==tplCat){var oldCatBtn=document.querySelector('#wbFilters [data-cat="'+cssSel(tplCat)+'"]');if(oldCatBtn)oldCatBtn.click()}
    if(oldLevel!==tplLevel){var oldLvBtn=document.querySelector('#wbFilters [data-lv="'+cssSel(tplLevel)+'"]');if(oldLvBtn)oldLvBtn.click()}
    applyTplDropdowns();
    tplFilterSyncing=false;
  }
  function cssSel(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}
  function applyTplDropdowns(){
    document.querySelectorAll('#tplList .tl-row[data-id]').forEach(function(row){
      var id=row.getAttribute('data-id'),it=tplItems().find(function(x){return String(x.id)===id});
      if(!it){row.hidden=false;return}
      row.hidden=(tplTask!=='all'&&(tplTask==='big')!==tplIsBig(it))||(tplCat!=='all'&&String(it.category||'')!==tplCat)||(tplLevel!=='all'&&String(it.level||'5.5')!==tplLevel);
    });
  }
  function initTplDropdowns(){
    if(tplFilterReady){return}
    var task=$('wrTplTask'),cat=$('wrTplCat'),lv=$('wrTplLevel');if(!task||!cat||!lv)return;
    task.addEventListener('change',function(){tplTask=task.value;tplCat='all';tplLevel='all';document.querySelectorAll('#wbFilters [data-lv="all"],#wbFilters [data-cat]').forEach(function(b){if(b.classList.contains('on'))b.click()});syncTplDropdowns()});
    cat.addEventListener('change',function(){tplCat=cat.value;tplLevel='all';document.querySelectorAll('#wbFilters [data-lv="all"],#wbFilters [data-cat]').forEach(function(b){if(b.classList.contains('on'))b.click()});syncTplDropdowns()});
    lv.addEventListener('change',function(){tplLevel=lv.value;document.querySelectorAll('#wbFilters [data-lv]').forEach(function(b){if(b.classList.contains('on'))b.click()});syncTplDropdowns()});
    var wf=$('wbFilters');if(wf)wf.addEventListener('click',function(e){if(tplFilterSyncing)return;var b=e.target&&e.target.closest('[data-lv],[data-cat]');if(!b)return;if(b.hasAttribute('data-lv'))tplLevel=b.getAttribute('data-lv')==='all'?'all':b.getAttribute('data-lv');else{var c=b.getAttribute('data-cat');tplCat=tplCat===c?'all':c}tplFilterReady=false;setTimeout(function(){tplFilterReady=true;syncTplDropdowns()},0)});
    tplFilterReady=true;syncTplDropdowns();
  }
  function syncTplFilterFromChips(){
    if(!tplFilterReady)return;
    var lv=document.querySelector('#wbFilters [data-lv].on'),cat=document.querySelector('#wbFilters [data-cat].on');
    if(lv)tplLevel=lv.getAttribute('data-lv')==='all'?'all':lv.getAttribute('data-lv');
    else tplLevel='all';
    tplCat=cat?cat.getAttribute('data-cat'):'all';
    syncTplDropdowns();
  }
  function qSub(kind,it){
    var src=String(kind==='big'?(it.en||it.zh||''):(it.title||'')).toLowerCase();
    if(kind==='big'){
      if(/discuss both (views|sides)|discuss these two points/.test(src))return '讨论型';
      if(/advantages? and disadvantages|advantages? outweigh|benefits? and drawbacks?|positive or negative/.test(src))return '优缺点型';
      if(/what are the (main )?(causes|reasons|problems|solutions|effects|impacts)/.test(src)||String(it.meta||'').toLowerCase().indexOf('report')>-1)return 'Report';
      if((String(it.en||'').match(/\?/g)||[]).length>=2)return '双问题型';
      return '观点型';
    }
    if(/\b(process|flow|cycle|life cycle|stages|diagram|is made|how .* (is|are))\b/.test(src))return '流程图';
    if(/\b(plan|map|layout)\b|development of (an|the) (area|town|city|site)/.test(src))return '地图题';
    if(/\b(19|20)\d{2}\b[\s\S]*\b(19|20)\d{2}\b|between .*\d{4}.* and .*\d{4}|from .*\d{4}.* to .*\d{4}/.test(src))return '动态图';
    return '静态图';
  }
  function qTitle(kind,it){
    if(typeof window.summarizeExamTitle==='function'){
      try{return window.summarizeExamTitle(kind,it)}catch(e){}
    }
    return String(it.summary||(kind==='big'?(it.zh||it.en||''):(it.title||''))).replace(/\s+/g,' ').slice(0,60);
  }
  function qEnglish(kind,it){return String(kind==='big'?(it.en||it.zh||''):(it.title||'')).replace(/\s+/g,' ')}
  function renderQSubs(){
    var box=$('wrQSubs'), d=promptData(), seen={}, list=[];
    (d[bankKind]||[]).forEach(function(it){var s=qSub(bankKind,it);if(!seen[s]){seen[s]=1;list.push(s)}});
    if(bankSub!=='all'&&!seen[bankSub])bankSub='all';
    box.innerHTML='<button type="button" class="'+(bankSub==='all'?'on':'')+'" data-wr-sub="all">全部</button>'
      +list.map(function(s){return '<button type="button" class="'+(bankSub===s?'on':'')+'" data-wr-sub="'+esc(s)+'">'+esc(s)+'</button>'}).join('');
    document.querySelectorAll('#wrQKind [data-wr-kind]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-wr-kind')===bankKind)});
  }
  function renderQuestionBank(){
    var listBox=$('wrQList');if(!listBox)return;
    renderQSubs();
    var q=bankQuery.trim().toLowerCase(),rows=[];
    (promptData()[bankKind]||[]).forEach(function(it){
      var sub=qSub(bankKind,it);
      if(bankSub!=='all'&&sub!==bankSub)return;
      var title=qTitle(bankKind,it);
      var hay=(title+' '+(it.en||'')+' '+(it.zh||'')+' '+(it.meta||'')).toLowerCase();
      if(q&&hay.indexOf(q)<0)return;
      rows.push({no:it.no,title:title,en:qEnglish(bankKind,it)});
    });
    listBox.innerHTML=rows.length?rows.map(function(it){
      return '<button type="button" class="wr-qrow" data-wr-question="'+esc(it.no)+'" data-wr-kind="'+esc(bankKind)+'">'
        +'<span class="wr-qrow-title"><span class="wr-qrow-en">'+esc(it.en)+'</span><span class="wr-qrow-cn">'+esc(it.title)+'</span></span>'
        +'<span class="wr-qstart">开始写'+ic('arrow')+'</span></button>';
    }).join(''):'<div class="wr-qempty"><b>没有匹配的题目</b><span>换个关键词或题型试试。</span></div>';
  }
  function renderRecords(){
    var box=$('wrRecordsBody');if(!box)return;
    var recs=scores().slice().reverse(),t=target();
    recordRefs=recs;
    if(!recs.length){
      box.innerHTML='<div class="wr-empty"><span class="wr-empty-ic" aria-hidden="true">'+ic('table')+'</span><b>还没有练习记录</b><span>写完一篇并提交评分，或粘贴已有作文评分，记录会自动收在这里。</span>'
        +'<div class="wr-empty-actions"><button type="button" class="wr-btn primary" data-wr-go="exam">去选题</button>'
        +'<button type="button" class="wr-btn" data-wr-go="score">粘贴评分</button></div></div>';
      return;
    }
    var vals=recs.map(function(r){return Number(r.result.overall)||0});
    var last=vals[0],prev=vals.length>1?vals[1]:null;
    var n3=Math.min(3,vals.length),avg=vals.slice(0,n3).reduce(function(a,b){return a+b},0)/n3;
    var diff=prev==null?null:last-prev;
    var bdKeys=['TR','CC','LR','GRA'];
    function bd(r,k){var b=r.result&&r.result.breakdown;if(!b)return '—';var v=num(b[k]);return v==null?'—':one(v)}
    var rows=recs.slice(0,20).map(function(r,i){
      var v=r.result&&r.result.overall!=null?Number(r.result.overall):null;
      var dims=bdKeys.map(function(k){return '<span><b>'+esc(bd(r,k))+'</b>'+esc(k==='TR'?'任务':k==='CC'?'连贯':k==='LR'?'词汇':'语法')+'</span>'}).join('');
      return '<button type="button" class="wr-record-row" data-wr-record="'+i+'">'
        +'<span class="wr-record-score">'+esc(v==null?'—':one(v))+'</span>'
        +'<span class="wr-record-copy"><b>'+esc(String(briefOf(r)).slice(0,80))+'</b><span>'+esc(r.date||'')+' · '+esc(modeOf(r))+'</span></span>'
        +'<span class="wr-record-dims">'+dims+'</span>'
        +'<span class="wr-record-go">回看'+ic('arrow')+'</span></button>';
    }).join('');
    var plot=recs.slice(0,Math.min(8,recs.length)).reverse();
    var trend='<section class="wr-record-trend"><div class="wr-record-trend-h"><b>分数变化</b><span>最近 '+plot.length+' 次</span></div>'
      +'<div class="wr-spark">'+sparkHtml(plot,t)+'</div>'
      +'<div class="wr-spark-foot"><span>'+esc((plot[0].date||'')+' · '+one(Number(plot[0].result.overall)||0))+'</span>'
      +'<span>'+esc((plot[plot.length-1].date||'')+' · '+one(Number(plot[plot.length-1].result.overall)||0))+'</span></div></section>';
    box.innerHTML='<section class="wr-record-summary"><div><b>'+esc(one(last))+'</b><span>最近一次</span></div>'
      +'<div><b>'+esc(one(avg))+'</b><span>近 '+n3+' 次平均</span></div>'
      +'<div><b class="'+(diff==null?'':' '+(diff>0?'up':diff<0?'down':''))+'">'+(diff==null?'—':(diff>0?'+':'')+one(diff))+'</b><span>较上一次</span></div>'
      +'<button type="button" class="wr-record-paste" data-wr-go="score">粘贴评分</button></section>'
      +'<div class="wr-record-grid"><section class="wr-record-list">'+rows+'</section>'+trend+'</div>';
  }
  function renderNav(){
    var box=$('wrNav');if(!box)return;
    box.innerHTML=TABS.map(function(tb){
      return '<button class="hub-sub" type="button" data-wr-tab="'+tb.id+'"><span class="hub-sub-ic">'+ic(tb.ic)+'</span>'
        +'<span class="hub-sub-nm">'+esc(tb.nm)+'</span></button>'}).join('');
    var m=$('wrMobileTabs');if(m)m.innerHTML=TABS.map(function(tb){return '<button type="button" data-wr-tab="'+tb.id+'">'+esc(tb.nm)+'</button>'}).join('');
    syncActive();
  }
  function syncActive(){var cur=window.__wrCur||'exam';if(cur==='score')cur=lastMain;document.querySelectorAll('[data-wr-tab]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-wr-tab')===cur)})}
  function syncBadges(){}
  function valid(id){return id==='score'||TABS.some(function(t){return t.id===id})}
  function renderPane(id){if(id==='records')renderRecords();else if(id==='exam')renderQuestionBank()}
  function hideNew(){var h=$('wrPaneHome'),r=$('wrPaneRecords'),e=$('wrPaneExam');if(h)h.hidden=true;if(r)r.hidden=true;if(e)e.hidden=true}
  function show(id,opts){
    if(!valid(id))return;
    window.__wrCur=id;
    if(id!=='score')lastMain=id;
    if(id==='records'||id==='exam'){
      LEGACY.forEach(function(pid){var p=$(pid);if(p)p.hidden=true});
      var h=$('wrPaneHome'),r=$('wrPaneRecords'),e=$('wrPaneExam');
      if(h)h.hidden=true;if(r)r.hidden=(id!=='records');if(e)e.hidden=(id!=='exam');
      var ep=$('examPanel');if(ep&&!document.body.classList.contains('exam-fullscreen'))ep.hidden=true;
    }else{
      var want=PANEL_OF[id];
      var btn=document.querySelector('#writeTabs [data-tab="'+id+'"]');
      if(btn){try{btn.click()}catch(e){}}   /* 让 switchWriteTab 跑 renderList/renderBank/renderScoreHist 等副作用 */
      LEGACY.forEach(function(pid){var p=$(pid);if(p)p.hidden=(pid!==want)});
      if(id==='tpl'){
        var lv=document.querySelector('#tplView [data-view="list"]');
        if(lv){try{lv.click()}catch(e){}}
        initTplDropdowns();
      }
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
    var kind=t.closest('[data-wr-kind][data-wr-question]');
    if(kind){
      var k=kind.getAttribute('data-wr-kind'),no=Number(kind.getAttribute('data-wr-question'));
      var item=(promptData()[k]||[]).find(function(x){return Number(x.no)===no});
      if(item){
        var f=$('examFilter'),sf=$('examSubFilter');
        if(f)f.value=k;
        if(sf)sf.value='all';
        var oldPane=$('wrPaneExam'),wasHidden=oldPane?oldPane.hidden:true;
        if(oldPane)oldPane.hidden=false;
        if(typeof window.renderExamList==='function')window.renderExamList();
        if(oldPane)oldPane.hidden=wasHidden;
        var legacy=document.querySelector('#examList .exam-item[data-kind="'+k+'"][data-no="'+no+'"]');
        if(legacy)legacy.click();
      }
      return;
    }
    var rk=t.closest('#wrQKind [data-wr-kind]');
    if(rk){bankKind=rk.getAttribute('data-wr-kind');bankSub='all';renderQuestionBank();return}
    var sub=t.closest('[data-wr-sub]');if(sub){bankSub=sub.getAttribute('data-wr-sub');renderQuestionBank();return}
    if(t.closest('#wrOwnQ')){show('score');setTimeout(function(){var s=$('scoreTopic');if(s){s.focus();s.scrollIntoView({block:'center',behavior:'auto'})}},50);return}
    var rr=t.closest('[data-wr-record]');
    if(rr){
      var rec=recordRefs[Number(rr.getAttribute('data-wr-record'))];
      show('score');
      setTimeout(function(){
        var title=String(rec&&rec.topic||rec&&rec.tplTitle||'').slice(0,26),row=null;
        var rows=document.querySelectorAll('#scoreHistList .hist-row');
        var idx=Number(rr.getAttribute('data-wr-record'));
        if(rows[idx])row=rows[idx];
        else rows.forEach(function(el){if(el.textContent.indexOf(title)>-1)row=el});
        if(row){recordReturn=true;row.click()}
      },60);
      return;
    }
    var g=t.closest('[data-wr-go]');if(g){show(g.getAttribute('data-wr-go'));return}
    var cn=t.closest('#bankPanel .bank-td-cn');
    if(cn){var row=cn.closest('tr');if(row)row.classList.toggle('is-selftest')}
  }
  function onInput(e){if(e.target&&e.target.id==='wrQSearch'){bankQuery=e.target.value;renderQuestionBank()}}
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
    if(window.__wrBodyObs){try{window.__wrBodyObs.disconnect()}catch(e){}}
    window.__wrBodyObs=new MutationObserver(function(){
      if(recordReturn&&!document.body.classList.contains('exam-fullscreen')){
        recordReturn=false;
        setTimeout(function(){show('records')},0);
      }
    });
    window.__wrBodyObs.observe(document.body,{attributes:true,attributeFilter:['class']});
    if(window.__wrTplObs){try{window.__wrTplObs.disconnect()}catch(e){}}
    window.__wrTplObs=new MutationObserver(function(){if(tplFilterReady)applyTplDropdowns()});
    var tl=$('tplList');if(tl)window.__wrTplObs.observe(tl,{childList:true});
    if(window.__wrTplChipObs){try{window.__wrTplChipObs.disconnect()}catch(e){}}
    window.__wrTplChipObs=new MutationObserver(syncTplFilterFromChips);
    var wf=$('wbFilters');if(wf)window.__wrTplChipObs.observe(wf,{childList:true});
    window.__wrObs=obs;
  }
  function bind(){
    if(window.__wrClick){try{document.removeEventListener('click',window.__wrClick)}catch(e){}}
    window.__wrClick=onClick;document.addEventListener('click',onClick);
    if(window.__wrChange){try{document.removeEventListener('change',window.__wrChange)}catch(e){}}
    window.__wrChange=onChange;document.addEventListener('change',onChange);
    if(window.__wrInput){try{document.removeEventListener('input',window.__wrInput)}catch(e){}}
    window.__wrInput=onInput;document.addEventListener('input',onInput);
    if(window.__wrMerge){try{document.removeEventListener('hub:data-merged',window.__wrMerge)}catch(e){}}
    window.__wrMerge=function(){renderNav();renderPane(window.__wrCur||'exam');renderViewHeads()};document.addEventListener('hub:data-merged',window.__wrMerge);
    if(window.__wrHash){try{window.removeEventListener('hashchange',window.__wrHash)}catch(e){}}
    window.__wrHash=function(){var id=hashId();if(id&&id!==window.__wrCur)show(id,{silent:true})};window.addEventListener('hashchange',window.__wrHash);
    observe();
  }
  function boot(){renderNav();bind();show(hashId()||subId()||'exam',{silent:true});renderViewHeads()}
  window.__wrTabs={show:show,renderNav:renderNav,renderPane:renderPane,cur:function(){return window.__wrCur}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
