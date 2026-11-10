(function(){
  'use strict';
  /* SPEAKING-TABS-1 任务1（11-08，她「口语也跟写作一样做了吧」）：
     把 design/SPEAKING-TABS-1-口语页侧栏各页UI样子稿-2026-11-07.html 的左栏 5 tab
     与「总览 / 模考记录」两页落进真页面，跟写作页 v823 同一套做法。
     · 不动 7 页共用的 js/hub-side-shell.js（动它要 7 页串号）；
     · 既有 6 个视图（#listView/#detailView/#mockView/#matView/#sentView/#coachView）
       与 #tabs 一个不删、ID 一个不改，js/speaking.js 照常写它们；
     · 左栏 5 tab 用属性 data-spt-tab（不是共用脚本的 data-hub-sub，避开 syncActive/onClick 误伤）；
       共用脚本 speaking 分支那 3 颗旧 sub 用页内 CSS 收起（#hubSubs{display:none!important}）；
     · 新组件统一 .spt- 前缀（speaking.html 已有大量 .sp-* 类，避开撞车）；
     · 数字全部现场算真字段，稿子里的示意数字一个不用，算不出留空态、不编百分比。
     5 tab 与既有视图的映射（任务1 先把壳与两页做实，题库/陪练/素材三页逐笔重皮）：
       home 总览       = 新 pane #sptPaneHome（本笔，全真数据）；
       bank 题库       → 转发 #tabs [data-type=BANK]（js/speaking.js 显示 #listView + renderList）；
       practice 陪练   → 转发 [data-type=PRACTICE]（#coachView 或 #sentView，含 coach 懒加载）；
       materials 素材  → 转发 [data-type=MAT]（#matView + materials.js 懒加载）；
       records 模考记录 = 新 pane #sptPaneRecords（本笔先给真记录表 + 真入口，任务5 补四维/三部分/ chips）。
     ⚠️ 与 js/speaking.js 共存（它跟写作的 switchWriteTab 不是一套）：
       speaking.js:81 的 #tabs click handler 会先 hidden 全部 6 个 view，再按 data-type 显示对应
       view 并跑 renderList / __coachShow / lateLoad('matView') / __mockEnter 等副作用，还会
       document.body.classList.remove('mock-immerse')。所以转发必须用 .click() 让整段副作用跑，
       绝不能只调 spActivateTab()（那个只切高亮、不切视图，见 js/sp-diag.js:130）。
       转发之后本文件不再手动改 6 个 view 的 hidden（交给 speaking.js），只收起两个新 pane。
     ⚠️ 时序：speaking.js ready 会无条件「程序化点 BANK」，:265-273 还有 setTimeout(0) 读
       tbSubPending('speaking') 的 ?sub= 深链，:275-282 ?open=<题id> 直达详情。本文件用
       MutationObserver 盯 6 个 view 的 hidden：任何 view 被显示就收起两个新 pane + 同步高亮；
       全部 view 收起（例如退出模考）就把当前 pane 归位，绝不出现空白或两层叠加。
       boot() 遇到既有直达参数（?open= / ?sub= / ?autostart / ?drill / ?senttab）不强制
       切 home，让既有流程主导，只挂 nav/observer 并同步高亮，既有直达功能零回归。
     真字段：DATA.mockRecords（kind==='speaking' 的整套模考，字段 overall / parts{p1,p2,p3}
       的 fc,lr,gra,overall / pronunciationScore / date / summary，见 js/mock.js:865-880）、
       DATA.speaking（js/data-static.js SPEAKING_BANK 89 条，getPracticeCount() 判练过，
       过滤口径与 js/sp-list.js:37 renderCockpit 一致）、DATA.settings.targets（speaking/overall）、
       examCountdown()（js/common.js:2651）。
     官方口径（设计稿头注释已核实）：口语四项标准 FC 流利性与连贯性 / LR 词汇丰富度 /
       GRA 语法多样性及准确性 / 发音 等权取平均、四舍五入半分、band 0–9 含半分无及格线；
       考试三段 P1 4-5min / P2 3-4min（含 1min 准备 + 最多 2min 独白）/ P3 4-5min，全程 11-14min。
       AI/模考预估分不是官方成绩，所以每处分数都标「预估分，不是官方成绩」；
       band 目标分用水平标尺，不是完成度百分比环（0–9 是能力量表，无分母不可算完成度）。
     软导航契约：本文件随每轮 window.eval 重跑，监听必须先 remove 再 add（bind()）。
     // TODO: [待确认] 模考记录页「四维横条 / P1-P2-P3 三部分表现 / chips 筛选 / 导出」在
       任务5 落；本笔只给真记录表与真入口，不动既有报告弹窗。
     // TODO: [待确认] 设计稿题库进度「41/89」的 41 是站内 getPracticeCount(s)>0 的题数，
       若她另有「练过 N 次才算」口径，点头后改 bankStats() 一处。 */
  var TABS=[
    {id:'home',nm:'总览',ic:'grid'},
    {id:'bank',nm:'题库',ic:'book'},
    {id:'practice',nm:'陪练',ic:'chat'},
    {id:'materials',nm:'素材',ic:'pen'},
    {id:'records',nm:'模考记录',ic:'table'},
    {id:'mock',nm:'完整模考',ic:'mock'}
  ];
  var ICON={
    grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    pen:'<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 6l3 3"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    mock:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9l4 3-4 3z"/>'
  };
  var VIEWS=['listView','detailView','mockView','matView','sentView','coachView'];
  var PANEL_OF={bank:'BANK',practice:'PRACTICE',materials:'MAT',records:'MOCK'};
  var OBS_MAP={listView:'bank',detailView:'bank',mockView:'records',matView:'materials',sentView:'practice',coachView:'practice'};
  var DIM=[['fc','FC','流利性与连贯性'],['lr','LR','词汇丰富度'],['gra','GRA','语法多样性及准确性']];

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function $(id){return document.getElementById(id)}
  function ic(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.grid)+'</svg>'}
  function num(v){var n=Number(v);return isFinite(n)?n:null}
  function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):'—'}
  function pad2(n){return String(n).length<2?('0'+n):String(n)}
  function today(){if(typeof window.todayKey==='function'){try{return window.todayKey()}catch(e){}}var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
  function dayAdd(d,n){if(typeof window.addDays==='function'){try{return window.addDays(d,n)}catch(e){}}var dt=new Date(d+'T00:00:00');dt.setDate(dt.getDate()+n);return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate())}
  function data(){return (typeof DATA!=='undefined'&&DATA)?DATA:{}}
  function mocks(){
    var a=Array.isArray(data().mockRecords)?data().mockRecords.slice():[];
    return a.filter(function(r){return r&&r.kind==='speaking'&&r.overall!=null})
            .sort(function(x,y){return String(x&&x.date||'').localeCompare(String(y&&y.date||''))});
  }
  function target(){var T=data().settings&&data().settings.targets||{};var s=parseFloat(T.speaking),o=parseFloat(T.overall);if(s>0)return s;if(o>0)return o;return 6}
  function countdown(){if(typeof window.examCountdown==='function'){try{return window.examCountdown()}catch(e){}}return null}
  function inRange(r){
    var rg=window.__sptRange||'30';if(rg==='all')return true;
    var n=Number(rg)||30,cut=dayAdd(today(),-n+1);
    return String(r&&r.date||'')>=cut;
  }
  function practiceCount(s){if(typeof window.getPracticeCount==='function'){try{return window.getPracticeCount(s)}catch(e){}}return 0}
  function bankStats(){
    var bank=Array.isArray(data().speaking)?data().speaking.filter(function(s){return s&&!s.framework&&!/^sp_p[12]_\d+$/.test(s.id||'')}):[];
    var p1=bank.filter(function(s){return s.type==='P1'}),p2=bank.filter(function(s){return s.type==='P2'});
    var done1=p1.filter(function(s){return practiceCount(s)>0}).length;
    var done2=p2.filter(function(s){return practiceCount(s)>0}).length;
    var ultraLeft=bank.filter(function(s){return s.frequency==='ultra'&&practiceCount(s)===0}).length;
    return {total:bank.length,p1:p1.length,p2:p2.length,done1:done1,done2:done2,
            done:done1+done2,ultraLeft:ultraLeft};
  }
  function weakDims(r){
    var parts=(r&&r.parts)||{},arr=[];
    DIM.forEach(function(d){
      var vals=['p1','p2','p3'].map(function(k){return num(parts[k]&&parts[k][d[0]])}).filter(function(v){return v!=null});
      if(vals.length)arr.push({nm:d[2]+'（'+d[1]+'）',v:vals.reduce(function(a,b){return a+b},0)/vals.length});
    });
    var pron=num(r&&r.pronunciationScore);
    if(pron!=null)arr.push({nm:'发音',v:pron});
    if(!arr.length)return [];
    arr.sort(function(a,c){return a.v-c.v});
    return arr.slice(0,2).map(function(x){return x.nm});
  }
  function dimOf(r){
    var parts=(r&&r.parts)||{},out={};
    DIM.forEach(function(d){
      var vals=['p1','p2','p3'].map(function(k){return num(parts[k]&&parts[k][d[0]])}).filter(function(v){return v!=null});
      if(vals.length)out[d[1]]=vals.reduce(function(a,b){return a+b},0)/vals.length;
    });
    var pron=num(r&&r.pronunciationScore);if(pron!=null)out['发音']=pron;
    return out;
  }
  function weakestName(r){
    var d=dimOf(r),best=null;
    Object.keys(d).forEach(function(k){if(best==null||d[k]<d[best])best=k});
    return best;
  }

  function statHtml(cards){
    return cards.map(function(c){
      return '<div class="spt-stat'+(c.ok?' ok':'')+'"><div class="k">'+esc(c.k)+'</div>'
        +'<div class="v'+(c.tone?' '+c.tone:'')+'">'+c.v+(c.unit?'<small>'+esc(c.unit)+'</small>':'')+'</div>'
        +'<div class="d">'+esc(c.d||'')+'</div></div>';
    }).join('');
  }
  function panelHead(title,hint){return '<div class="spt-panel-h"><b>'+esc(title)+'</b>'+(hint?'<span>'+esc(hint)+'</span>':'')+'</div>'}
  function sparkHtml(recs,t){
    var W=280,H=76,P=8;
    var vals=recs.map(function(r){return Number(r.overall)||0});
    if(!vals.length)return '';
    var lo=Math.min.apply(null,vals.concat([t-0.5])),hi=Math.max.apply(null,vals.concat([t+0.5]));
    if(hi-lo<1){hi=lo+1}
    var X=function(i){return vals.length>1?P+i*(W-2*P)/(vals.length-1):W/2};
    var Y=function(v){return H-P-(v-lo)/(hi-lo)*(H-2*P)};
    var pts=vals.map(function(v,i){return X(i).toFixed(1)+','+Y(v).toFixed(1)}).join(' ');
    var dots=vals.map(function(v,i){return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="3.4" class="spt-line-dot"/>'}).join('');
    var gy=Y(t).toFixed(1);
    return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="口语模考分走势">'
      +'<line x1="0" y1="'+gy+'" x2="'+W+'" y2="'+gy+'" class="spt-line-goal"/>'
      +'<polyline points="'+pts+'" fill="none" stroke="var(--st-teal)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'
      +dots+'</svg>';
  }
  function rulerHtml(cur,t){
    var gp=Math.max(0,Math.min(100,t/9*100)).toFixed(1);
    var cp=cur==null?null:Math.max(0,Math.min(100,cur/9*100)).toFixed(1);
    var ticks='';for(var i=0;i<=9;i++)ticks+='<span>'+i+'</span>';
    return '<div class="spt-panel" style="margin-bottom:14px">'+panelHead('口语分与目标','水平标尺，不是完成度百分比')
      +'<div class="spt-ruler"><div class="spt-ruler-track">'
      +(cp!=null?'<i style="width:'+cp+'%"></i>':'')
      +'<span class="spt-ruler-goal" style="left:'+gp+'%"></span>'
      +(cp!=null?'<span class="spt-ruler-cur" style="left:'+cp+'%"></span>':'')
      +'</div><div class="spt-ruler-ticks">'+ticks+'</div></div></div>';
  }
  function calloutHtml(weak,ultraLeft){
    var head=weak.length>=2?(weak[0]+' 和 '+weak[1]+' 是短板'):(weak.length===1?(weak[0]+' 是短板'):'按官方四项标准继续练');
    var sub='先补偏低项，再整套限时模考'+(ultraLeft?('；P1 必考题还剩 '+ultraLeft+' 道没练'):'')+'。';
    return '<div class="spt-callout"><span class="ic">'+ic('sun')+'</span>'
      +'<span class="tx"><b>'+esc(head)+'</b><span>'+esc(sub)+'</span></span>'
      +'<button type="button" class="spt-btn" data-spt-go="bank">去练必考题</button></div>';
  }

  /* SPEAKING-VIEWS-2（v833）：三个转发功能栏共用一枚栏头（#spvHead）。
     真数据现场算，绝不写死稿里的示意数字；不动 coach.js / materials.js / sp-list.js。 */
  var VIEW_HEAD={
    bank:{h1:'题库',hint:'按考频和分类挑一道，开口练或看框架',
      stat:function(){var b=bankStats();return b.total+' 题 · P1 '+b.p1+' / P2 '+b.p2}},
    practice:{h1:'陪练',hint:'开口说、录音自查，AI 记住你的常错点',
      stat:function(){var a=(typeof DATA!=='undefined'&&DATA&&Array.isArray(DATA.coachMem))?DATA.coachMem:[];return '已记住 '+a.length+' 条'}},
    materials:{h1:'素材',hint:'万能故事卡，一张能串好几道 P2',
      stat:function(){var n=0;try{var s=JSON.parse(localStorage.getItem('ielts_materials_v1')||'{}');n=(s.materials||[]).length}catch(e){}return n?('已有 '+n+' 张素材卡'):'还没有素材卡'}}
  };
  function paintHead(){
    var head=$('spvHead');if(!head)return;
    var cfg=VIEW_HEAD[window.__sptCur||'home'];
    if(!cfg){head.hidden=true;return}
    head.hidden=false;
    head.innerHTML='<div class="spv-t"><h1>'+esc(cfg.h1)+'</h1><span>'+esc(cfg.hint)+'</span></div>'
      +'<span class="spv-stat">'+esc(cfg.stat())+'</span>';
  }

  function mockBtnHtml(){return '<button type="button" class="spt-btn primary" data-spt-mock>开始一次模考</button>'}

  function renderHome(){
    var box=$('sptHomeBody');if(!box)return;
    var all=mocks(),recs=all.filter(inRange),t=target(),bs=bankStats(),cd=countdown();
    if(!recs.length){
      var msg=all.length?'这个时间范围里还没有模考，换到「全部时间」看看。':'还没有口语模考成绩。做一次整套模考（P1 → P2 → P3，约 12 分钟），AI 按官方四项估一次分，就能看见自己的起点。';
      box.innerHTML='<div class="spt-empty"><b>'+(all.length?'这个范围没有模考':'还没有口语模考成绩')+'</b>'+esc(msg)
        +'<div style="margin-top:14px">'+mockBtnHtml()+'</div></div>';
      return;
    }
    var last=recs[recs.length-1],ov=Number(last.overall)||0;
    var gap=Math.round((t-ov)*2)/2,weak=weakDims(last);
    var hasExam=!!(cd&&cd.hasExam&&cd.daysLeft!=null&&cd.daysLeft>=0);
    var cards=[
      {k:'最近一次模考',v:one(ov),unit:'/ 9',d:(last.date||'')+' · 预估分，不是官方成绩',ok:true,tone:'teal'},
      {k:'距目标口语 '+t,v:gap>0?('差 '+gap):'已达标',d:gap>0?(weak.length?('四项里 '+weak.join('、')+' 偏低'):'再练一轮整套模考'):'已达到目标分',tone:gap>0?'warn':'teal'},
      {k:'题库进度',v:String(bs.done),unit:'/ '+bs.total,d:'P1 '+bs.done1+'/'+bs.p1+' · P2 '+bs.done2+'/'+bs.p2},
      {k:hasExam?('距 '+(cd.md||'考试')):'距考试',v:hasExam?String(cd.daysLeft):'—',unit:hasExam?'天':'',d:bs.ultraLeft?('必考题还剩 '+bs.ultraLeft+' 道没练'):'必考题已全部练过'}
    ];
    var recent=recs.slice(-3).reverse();
    var recentHtml=recent.map(function(r){
      var v=Number(r.overall)||0,key=v>=t;
      return '<div class="spt-mini-row"><span class="grow"><span class="t">'+esc((r.date||'')+' · 整套模考')+'</span>'
        +'<span class="d">'+esc(String((r.summary||'P1 / P2 / P3 按官方四项估分')).slice(0,34))+'</span></span>'
        +'<span class="spt-pill '+(key?'key':'warn')+'">'+esc(one(v))+'</span></div>';
    }).join('');
    var sparkFoot='<div class="spt-spark-foot"><span>'+esc((recs[0].date||'')+' · '+one(recs[0].overall))
      +'</span><span>'+esc((last.date||'')+' · '+one(ov))+'</span></div>';
    var twoCol='<div class="spt-two-col">'
      +'<div class="spt-panel">'+panelHead('模考分走势','近 '+Math.min(recs.length,8)+' 场 · 每个点是一场 · 虚线 = 目标 '+t)
        +'<div class="spt-spark">'+sparkHtml(recs.slice(-8),t)+sparkFoot+'</div></div>'
      +'<div class="spt-panel">'+panelHead('最近三场','预估分，不是官方成绩')+recentHtml+'</div></div>';
    box.innerHTML='<div class="spt-stat-grid">'+statHtml(cards)+'</div>'
      +rulerHtml(ov,t)+calloutHtml(weak,bs.ultraLeft)+twoCol;
  }
  function renderRecords(){
    var box=$('sptRecordsBody');if(!box)return;
    var all=mocks(),recs=all.filter(inRange).slice().reverse(),t=target();
    if(!recs.length){
      var msg=all.length?'这个时间范围里还没有模考，换到「全部时间」看看。':'做一次整套模考（P1 → P2 → P3），结果会自动存到这里。';
      box.innerHTML='<div class="spt-empty"><b>'+(all.length?'这个范围没有模考':'还没有模考记录')+'</b>'+esc(msg)
        +'<div style="margin-top:14px">'+mockBtnHtml()+'</div></div>';
      return;
    }
    var last3=recs.slice(0,3).map(function(r){return Number(r.overall)||0});
    var avg=Math.round(last3.reduce(function(a,b){return a+b},0)/last3.length*2)/2;
    var wk=weakestName(recs[0]);
    var cards=[
      {k:'近一次预估',v:one(recs[0].overall),d:(recs[0].date||'')+' · 整套模考',ok:true,tone:'teal'},
      {k:'近 3 场均值',v:one(avg),d:'预估分，不是官方成绩'},
      {k:'累计模考',v:String(all.length),unit:'场',d:'按日期倒序显示'},
      {k:'最弱一项',v:esc(wk||'—'),d:wk?'按官方四项标准':'还没有四维记录',tone:'warn'}
    ];
    /* 最近一场 · 官方四项横条（FC / LR / GRA / 发音），竖线 = 目标分 */
    var last=recs[0],dims=dimOf(last),gp=Math.max(0,Math.min(100,t/9*100));
    var critDefs=[['FC','流利性与连贯性'],['LR','词汇丰富度'],['GRA','语法多样性及准确性'],['发音','设置里的固定分']];
    var critRows=critDefs.map(function(d){
      var v=dims[d[0]],has=v!=null,dv=has?(Math.round(v*2)/2):null;
      var fp=has?Math.max(0,Math.min(100,v/9*100)):0,weak=has&&dv<t;
      return '<div class="sv-crit"><span class="nm">'+d[0]+'<em>'+d[1]+'</em></span>'
        +'<span class="track"><i class="fill'+(weak?' weak':'')+'" style="width:'+fp.toFixed(1)+'%"></i>'
        +'<i class="goal" style="left:'+gp.toFixed(1)+'%"></i></span>'
        +'<span class="v">'+(has?one(dv):'—')+(weak?' <small>差 '+one(t-dv)+'</small>':'')+'</span></div>';
    }).join('');
    var lastPanel='<div class="spt-panel">'+panelHead('最近一场 · '+(last.date||''),'官方四项标准 · 竖线 = 目标 '+t)
      +critRows
      +'<div class="sv-overall"><div class="big">'+one(last.overall)+'<small>/ 9</small></div>'
      +'<div class="lb">AI 预估总分<span>四项平均按官方半分进位 · 仅供参考，不代表真实考试成绩</span></div></div></div>';
    /* 三部分表现：直接读 parts.p1/p2/p3 的 overall 与 summary */
    var parts=(last&&last.parts)||{};
    var partDefs=[['p1','P1 · 短答'],['p2','P2 · 独白'],['p3','P3 · 讨论']];
    var partBoxes=partDefs.map(function(p){
      var o=parts[p[0]],v=o&&num(o.overall),s=o&&o.summary;
      return '<div class="sv-part"><div class="ph">'+p[1]+' <span class="b">'+(v!=null?one(v):'—')+'</span></div>'
        +'<div class="d">'+esc(s?String(s).slice(0,60):'这一场没有这部分记录')+'</div></div>';
    }).join('');
    var partPanel='<div class="spt-panel">'+panelHead('三部分表现','每部分单独评 FC / LR / GRA')
      +'<div class="sv-part-grid">'+partBoxes+'</div></div>';
    /* 记录表：整卷模考逐场，四维分数低于目标标低，胶囊可筛达标 / 未达标 */
    var okN=recs.filter(function(r){return (Number(r.overall)||0)>=t}).length;
    var rows=recs.slice(0,20).map(function(r){
      var d=dimOf(r),v=Number(r.overall)||0,key=v>=t,low=weakestName(r);
      function sc(k){var x=d[k];return '<td class="sv-sc'+(x!=null&&x<t?' low':'')+'">'+(x!=null?one(x):'—')+'</td>'}
      return '<tr data-band="'+(key?'ok':'low')+'"><td class="sv-date">'+esc(r.date||'')+'</td>'
        +'<td><span class="spt-pill '+(key?'key':'warn')+'">整套模考</span></td>'
        +sc('FC')+sc('LR')+sc('GRA')+sc('发音')
        +'<td class="sv-overall-td">'+one(v)+'</td><td>'+esc(low||'—')+'</td></tr>';
    }).join('');
    var tbl='<div class="spt-panel">'
      +'<div class="spt-panel-h"><span class="sv-chips">'
      +'<button type="button" class="sv-chip on" data-sv-chip="all">全部 '+recs.length+'</button>'
      +'<button type="button" class="sv-chip" data-sv-chip="ok">达标 '+okN+'</button>'
      +'<button type="button" class="sv-chip" data-sv-chip="low">未达标 '+(recs.length-okN)+'</button></span></div>'
      +'<div class="sv-tbl-scroll"><table class="sv-rec-table"><thead><tr>'
      +'<th>日期</th><th>类型</th><th>FC</th><th>LR</th><th>GRA</th><th>发音</th><th>预估总分</th><th>最弱环节</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<div class="sv-table-foot"><span>共 '+recs.length+' 场 · AI 预估分，非官方成绩</span>'
      +'<span style="margin-left:auto">按日期倒序</span></div></div>';
    box.innerHTML='<div class="spt-stat-grid">'+statHtml(cards)+'</div>'
      +lastPanel+partPanel+tbl
      +'<div style="margin-top:14px">'+mockBtnHtml()+'</div>';
  }

  function renderNav(){
    var box=$('sptNav');if(!box)return;
    var bs=bankStats(),badges={bank:bs.total,records:mocks().length};
    box.innerHTML=TABS.map(function(tb){var n=badges[tb.id];
      return '<button class="hub-sub" type="button" data-spt-tab="'+tb.id+'"><span class="hub-sub-ic">'+ic(tb.ic)+'</span>'
        +'<span class="hub-sub-nm">'+esc(tb.nm)+'</span>'+(n?'<span class="hub-sub-n">'+esc(n)+'</span>':'')+'</button>'}).join('');
    var m=$('sptMobileTabs');if(m)m.innerHTML=TABS.map(function(tb){return '<button type="button" data-spt-tab="'+tb.id+'">'+esc(tb.nm)+'</button>'}).join('');
    syncActive();
  }
  function syncActive(){var cur=window.__sptCur||'home';document.querySelectorAll('[data-spt-tab]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-spt-tab')===cur)});paintHead()}
  function syncBadges(){
    var bs=bankStats(),badges={bank:bs.total,records:mocks().length};
    document.querySelectorAll('#sptNav [data-spt-tab]').forEach(function(b){
      var id=b.getAttribute('data-spt-tab'),n=badges[id],nb=b.querySelector('.hub-sub-n');
      if(n){if(!nb){nb=document.createElement('span');nb.className='hub-sub-n';b.appendChild(nb)}nb.textContent=String(n)}
      else if(nb){nb.parentNode.removeChild(nb)}
    });
  }
  function valid(id){return TABS.some(function(t){return t.id===id})}
  function renderPane(id){if(id==='home')renderHome();else if(id==='records')renderRecords()}
  function hideNew(){var h=$('sptPaneHome'),r=$('sptPaneRecords'),m=$('sptPaneMock');if(h)h.hidden=true;if(r)r.hidden=true;if(m)m.hidden=true}
  function show(id,opts){
    if(!valid(id))return;
    window.__sptCur=id;
    if(id==='home'||id==='records'||id==='mock'){
      /* 与 speaking.js:88 切 tab 同款：离开模考视图时移除沉浸态，否则新 pane 会被
         body.mock-immerse .spt-pane{display:none!important} 压住变空白。 */
      try{document.body.classList.remove('mock-immerse')}catch(e){}
      VIEWS.forEach(function(vid){var e=$(vid);if(e)e.hidden=true});
      var h=$('sptPaneHome'),r=$('sptPaneRecords'),m=$('sptPaneMock');
      if(h)h.hidden=(id!=='home');if(r)r.hidden=(id!=='records');if(m)m.hidden=(id!=='mock');
    }else{
      var dt=PANEL_OF[id];
      var btn=document.querySelector('#tabs [data-type="'+dt+'"]');
      if(btn){try{btn.click()}catch(e){}}  /* 让 speaking.js:81 整段副作用跑，绝不只调 spActivateTab */
      hideNew();
    }
    syncActive();syncBadges();renderPane(id);
    try{var hm=document.querySelector('.hub-main');if(hm)hm.scrollTop=0;var main=document.querySelector('main.container');if(main)main.scrollTop=0}catch(e){}
    try{if(typeof window.hubResetPageScroll==='function')window.hubResetPageScroll();if(typeof window.hubFitPageScroll==='function')window.hubFitPageScroll()}catch(e){}
    if(!(opts&&opts.silent)){try{history.replaceState(null,'','#spt='+id)}catch(e){}}
    try{document.dispatchEvent(new CustomEvent('spt:tab',{detail:{id:id}}))}catch(e){}
  }
  function hashId(){var h=(location.hash||'').replace('#','');if(h.indexOf('spt=')===0)h=h.slice(4);return valid(h)?h:null}
  function subId(){
    /* tbSubPending('speaking') 会清掉 sessionStorage 里的值（js/common.js:612），
       等价于 speaking.js:265-273 的 setTimeout(0) 深链；本文件自己 show 对应 tab，
       speaking.js 稍后再读时值已空、不会重复点，效果一致不冲突。 */
    try{
      var q=(typeof tbSubPending==='function')?String(tbSubPending('speaking')||''):'';
      var m={BANK:'bank',PRACTICE:'practice',MAT:'materials'};
      if(m[q])return m[q];
    }catch(e){}
    return null;
  }
  function hasDeep(){
    try{var q=new URLSearchParams(location.search);
      return !!(q.get('open')||q.get('autostart')||q.get('drill')||q.get('senttab')||q.get('sub'));
    }catch(e){return false}
  }
  function onClick(e){var t=e.target;if(!t||!t.closest)return;
    var b=t.closest('[data-spt-tab]');if(b){e.preventDefault();show(b.getAttribute('data-spt-tab'));return}
    var g=t.closest('[data-spt-go]');if(g){show(g.getAttribute('data-spt-go'));return}
    var mk=t.closest('[data-spt-mock]');if(mk){
      /* 真入口：点既有 #tabs [data-type=MOCK]（hidden 按钮仍可程序触发），
         走 js/speaking.js 的整套模考流程 + js/mock.js 全屏沉浸式，不另造第二套。 */
      var mb=document.querySelector('#tabs [data-type="MOCK"]');
      if(mb){try{mb.click()}catch(err){}}
      return;
    }
    var ch=t.closest('[data-sv-chip]');if(ch){
      var k=ch.getAttribute('data-sv-chip');
      document.querySelectorAll('#sptRecordsBody [data-sv-chip]').forEach(function(b){b.classList.toggle('on',b===ch)});
      document.querySelectorAll('#sptRecordsBody .sv-rec-table tbody tr').forEach(function(tr){tr.hidden=(k!=='all'&&tr.getAttribute('data-band')!==k)});
      return;
    }
  }
  function onChange(e){var s=e.target;
    if(s&&s.matches&&s.matches('.spt-range')){
      window.__sptRange=s.value;
      document.querySelectorAll('.spt-range').forEach(function(x){x.value=window.__sptRange});
      if(window.__sptCur==='home')renderHome();
      else if(window.__sptCur==='records')renderRecords();
    }
  }
  function observe(){
    if(window.__sptObs){try{window.__sptObs.disconnect()}catch(e){}}
    var obs=new MutationObserver(function(muts){
      var shown=null;
      for(var i=0;i<muts.length;i++){
        var el=muts[i].target,id=el&&el.id;
        if(id&&OBS_MAP[id]&&!el.hidden){shown=id;break}
      }
      if(shown){
        hideNew();
        var want=OBS_MAP[shown];
        if(window.__sptCur!==want){window.__sptCur=want;syncActive()}else{paintHead()}
        return;
      }
      /* 6 个 view 全被收起（例如退出模考）→ 把当前 pane 归位，绝不空白 */
      var anyVisible=VIEWS.some(function(id){var e=$(id);return e&&!e.hidden});
      var cur=window.__sptCur||'home';
      if(!anyVisible&&(cur==='home'||cur==='records'||cur==='mock')){
        var pid=cur==='home'?'sptPaneHome':(cur==='records'?'sptPaneRecords':'sptPaneMock');
        var p=$(pid);
        if(p&&p.hidden){p.hidden=false;renderPane(cur)}
      }
    });
    VIEWS.forEach(function(vid){var e=$(vid);if(e)obs.observe(e,{attributes:true,attributeFilter:['hidden']})});
    window.__sptObs=obs;
  }
  function bind(){
    if(window.__sptClick){try{document.removeEventListener('click',window.__sptClick)}catch(e){}}
    window.__sptClick=onClick;document.addEventListener('click',onClick);
    if(window.__sptChange){try{document.removeEventListener('change',window.__sptChange)}catch(e){}}
    window.__sptChange=onChange;document.addEventListener('change',onChange);
    if(window.__sptMerge){try{document.removeEventListener('hub:data-merged',window.__sptMerge)}catch(e){}}
    window.__sptMerge=function(){syncBadges();renderNav();renderPane(window.__sptCur||'home')};document.addEventListener('hub:data-merged',window.__sptMerge);
    if(window.__sptHash){try{window.removeEventListener('hashchange',window.__sptHash)}catch(e){}}
    window.__sptHash=function(){var id=hashId();if(id&&id!==window.__sptCur)show(id,{silent:true})};window.addEventListener('hashchange',window.__sptHash);
    observe();
  }
  function boot(){
    renderNav();bind();
    var h=hashId(),s=subId();
    if(h||s){show(h||s,{silent:true});return}
    if(hasDeep()){window.__sptCur='bank';syncActive();syncBadges();return}
    show('home',{silent:true});
  }
  window.__sptTabs={show:show,renderNav:renderNav,renderPane:renderPane,cur:function(){return window.__sptCur}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
