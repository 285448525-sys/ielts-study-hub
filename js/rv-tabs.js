(function(){
  'use strict';
  /* 回顾 · 成品框架 1116
     三页只展示当前动作需要的内容：总览看最近结果，趋势看变化，记录按类型与范围回看。
     录入继续复用 #rv2AddDialog / scores.js，删除继续转发原列表按钮，不改存储口径。 */
  var $=function(id){return document.getElementById(id)};
  var $$=function(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel))};
  var SUBS=[
    {k:'listening',n:'听力',num:'rvxNumL',sub:'rvxSubL'},
    {k:'reading',n:'阅读',num:'rvxNumR',sub:'rvxSubR'},
    {k:'writing',n:'写作',num:'rvxNumW',sub:'rvxSubW'},
    {k:'speaking',n:'口语',num:'rvxNumS',sub:'rvxSubS'}
  ];
  var TABS=[{id:'home',n:'总览'},{id:'trend',n:'趋势'},{id:'records',n:'记录'}];
  var COLORS={teal:'#3a9a93',tealD:'#2f7d76',amber:'#b3792c',line:'#e6e9ea',lineSoft:'#eef1f2',muted:'#71767e',ink:'#1f2328',surface:'#fff'};
  var state=window.__rvFinalState||(window.__rvFinalState={pane:'home',homeRange:'five',subject:'overall',metric:'score',recType:'all',recRange:'five'});
  var fallbackTasks=false;
  var addCounts={whole:null,part:null};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function pad(n){return n<10?'0'+n:''+n}
  function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function dayOffset(n){var d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function md(s){s=String(s||'');return s.length>=10?s.slice(5,10):s}
  function num(v){v=Number(v);return isFinite(v)?v:null}
  function fmt(v){v=num(v);return v==null?'—':(Math.round(v*2)/2).toFixed(1)}
  function overall(x){var a=num(x&&x.listening),b=num(x&&x.reading),c=num(x&&x.writing),d=num(x&&x.speaking);return a==null||b==null||c==null||d==null?null:Math.round((a+b+c+d)/4*2)/2}
  function targets(){var t=(typeof DATA!=='undefined'&&DATA&&DATA.settings&&DATA.settings.targets)||{};return t}
  function scores(){
    if(typeof DATA==='undefined'||!DATA||!Array.isArray(DATA.scores))return [];
    return DATA.scores.filter(function(x){return x&&overall(x)!=null}).slice().sort(function(a,b){
      return String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||''));
    });
  }
  function mockRecords(){return (typeof DATA!=='undefined'&&DATA&&Array.isArray(DATA.mockRecords))?DATA.mockRecords.slice():[]}
  function isSpeaking(r){return !!r&&(r.kind==='speaking'||(!Array.isArray(r.parts)&&r.p1))}
  function dayRecords(){var m={};(typeof DATA!=='undefined'&&DATA&&Array.isArray(DATA.mockRecords)?DATA.mockRecords:[]).forEach(function(r){
    if(!r||!Array.isArray(r.parts)||(r.type!=='listening'&&r.type!=='reading')||r.granularity==='whole')return;
    var d=String(r.date||'').slice(0,10),c=0,t=0;
    r.parts.forEach(function(p){c+=Number(p.correct)||0;t+=Number(p.total)||0});
    if(!d||!t)return;if(!m[r.type])m[r.type]={};if(!m[r.type][d])m[r.type][d]={date:d,c:0,t:0};
    m[r.type][d].c+=c;m[r.type][d].t+=t;
  });return m}
  function recItems(){
    try{if(typeof RecAll!=='undefined'&&RecAll&&typeof RecAll.collect==='function')return RecAll.collect()}catch(e){}
    return [];
  }
  function icon(kind){
    var p=kind==='ok'?'<path d="M20 6 9 17l-5-5"/>':'<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
  }

  function renderNav(){
    var nav=$('rvNav');
    if(nav)nav.innerHTML=TABS.map(function(t){
      return '<button class="hub-sub'+(state.pane===t.id?' on':'')+'" type="button" data-rv-tab="'+t.id+'">'
        +'<span class="hub-sub-ic">'+navIcon(t.id)+'</span><span class="hub-sub-nm">'+t.n+'</span></button>';
    }).join('');
    var mob=$('rvMobileTabs');
    if(mob)mob.innerHTML=TABS.map(function(t){
      return '<button type="button" role="tab" data-rv-tab="'+t.id+'" class="'+(state.pane===t.id?'on':'')+'" aria-selected="'+(state.pane===t.id?'true':'false')+'">'+t.n+'</button>';
    }).join('');
  }
  function navIcon(id){
    var p=id==='home'
      ?'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'
      :id==='trend'?'<path d="M3 3v18h18"/><path d="m6 15 4-5 3 3 5-7"/>'
      :'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
  }

  function renderHome(){
    var list=scores(),has=list.length>0;
    $('rvaHomeEmpty').hidden=has;
    $('rvaHomeData').hidden=!has;
    if(!has)return;
    var last=list[list.length-1],lo=overall(last),t=targets(),to=num(t.overall);
    $('rvxNumAll').textContent=fmt(lo);
    $('rvaLatestDate').textContent=last.date+(last.note?' · '+last.note:'');
    var targetEl=$('rvxSubAll');
    targetEl.classList.toggle('is-weak',to!=null&&lo<to);
    targetEl.textContent=to==null?'目标未设':'目标 '+fmt(to)+(lo>=to?' · 已达标':' · 差 '+fmt(to-lo));

    var weak=[];
    SUBS.forEach(function(s){
      var card=document.querySelector('[data-subject-card="'+s.k+'"]'),v=num(last[s.k]),tg=num(t[s.k]);
      var val=$(s.num),sub=$(s.sub);
      if(val)val.textContent=fmt(v);if(sub)sub.textContent=tg==null?'目标未设':(v>=tg?'已达标':'目标 '+fmt(tg));
      if(card){
        var isWeak=tg!=null&&v<tg;card.classList.toggle('is-weak',isWeak);
        var bar=card.querySelector('.rva-bar i'),mark=card.querySelector('.rva-bar em');
        if(bar)bar.style.width=Math.max(0,Math.min(100,(v||0)/9*100))+'%';
        if(mark){if(tg==null)mark.hidden=true;else{mark.hidden=false;mark.style.left=Math.min(100,tg/9*100)+'%'}}
      }
      if(tg!=null&&v<tg)weak.push({k:s.k,n:s.n,gap:tg-v});
    });
    weak.sort(function(a,b){return b.gap-a.gap});
    var ins=$('rvaInsight');
    if(to==null&&!Object.keys(t).length){
      ins.innerHTML='<span class="rva-insight-ic">'+icon('warn')+'</span><b>先设四科目标，后面就能直接看差距</b><button class="rva-btn-sm" type="button" data-rv-jump="settings">去设目标</button>';
    }else if(weak.length){
      var w=weak[0];
      ins.innerHTML='<span class="rva-insight-ic">'+icon('warn')+'</span><b>'+w.n+'还差 '+fmt(w.gap)+' 分，先补这一科</b><button class="rva-btn-sm" type="button" data-rv-jump="'+w.k+'">去练'+w.n+'</button>';
    }else{
      ins.innerHTML='<span class="rva-insight-ic is-ok">'+icon('ok')+'</span><b>四科都已达到目标</b><button class="rva-btn-sm" type="button" data-rv-jump="bank">继续练习</button>';
    }
    renderMini();
  }

  function renderMini(){
    var list=scores(),pts;
    if(state.homeRange==='days'){
      var from=dayOffset(-10);
      pts=list.filter(function(x){return x.date>=from}).map(function(x){return {date:x.date,value:overall(x)}});
    }else pts=list.slice(-5).map(function(x){return {date:x.date,value:overall(x)}});
    var c=$('rvaMini'),empty=$('rvaMiniEmpty'),foot=$('rvaMiniFoot');
    if(pts.length<2){c.style.visibility='hidden';empty.hidden=false;foot.hidden=true;return}
    c.style.visibility='visible';empty.hidden=true;foot.hidden=false;
    var t=targets();
    foot.innerHTML='<span>'+md(pts[0].date)+' · '+fmt(pts[0].value)+'</span><span>'+(num(t.overall)!=null?'目标 '+fmt(t.overall):'目标未设')+'</span><span>'+md(pts[pts.length-1].date)+' · '+fmt(pts[pts.length-1].value)+'</span>';
    drawChart(c,{points:pts,target:num(t.overall),compact:true,tip:$('rvaMiniTip')});
  }

  function subjectPoints(subject){
    var per={};
    scores().forEach(function(r){
      var v=subject==='overall'?overall(r):num(r[subject]);
      if(v!=null)per[r.date]={date:r.date,value:v};
    });
    if(subject!=='overall'){
      mockRecords().forEach(function(r){
        if(!r||!r.date)return;
        var v=null;
        if(subject==='speaking'&&isSpeaking(r))v=num(r.overall);
        if(subject!=='speaking'&&subject===r.type&&!isSpeaking(r)&&Array.isArray(r.parts)){
          var score=0,weight=0,c=0,total=0;
          r.parts.forEach(function(p){
            if(num(p.score)!=null){var w=num(p.weight);score+=num(p.score)*(w==null?1:w);weight+=(w==null?1:w)}
            c+=Number(p.correct)||0;total+=Number(p.total)||0;
          });
          if(weight)v=Math.round(score/weight*2)/2;
          else if(num(r.overall)!=null)v=num(r.overall);
          else if(total&&typeof estimateBand==='function')v=estimateBand(r.type,c,total);
        }
        var d=String(r.date).slice(0,10);
        if(v!=null&&d)per[d]={date:d,value:v};
      });
    }
    return Object.keys(per).sort().map(function(d){return per[d]});
  }
  function countPoints(subject){
    var cp=dayRecords()[subject]||{};
    return Object.keys(cp).sort().map(function(d){return {date:d,value:cp[d].c,total:cp[d].t}});
  }
  function targetCount(subject){
    if(typeof BAND_TABLE==='undefined'||!BAND_TABLE[subject])return null;
    var t=num(targets()[subject]);if(t==null)return null;
    var cp=dayRecords()[subject]||{},maxT=0;
    Object.keys(cp).forEach(function(d){if(cp[d].t>maxT)maxT=cp[d].t});
    if(!maxT)return null;
    for(var i=0;i<BAND_TABLE[subject].length;i++)if(BAND_TABLE[subject][i][1]===t)return Math.round(BAND_TABLE[subject][i][0]/40*maxT);
    return null;
  }

  function renderTrend(){
    var sub=state.subject;
    if(state.metric==='count'&&sub!=='listening'&&sub!=='reading')state.metric='score';
    var pts=state.metric==='count'?countPoints(sub):subjectPoints(sub),has=pts.length>0;
    var panel=document.querySelector('.rva-trend-panel');
    panel.classList.toggle('is-empty',!has);
    $('rvaTrendTools').hidden=!has;
    $('rvaTrendSummary').hidden=!has;
    $('rvaTrendEmpty').hidden=has;
    $('rv2TrendCanvas').style.visibility=has?'visible':'hidden';
    $$('#rvxTrendChips button').forEach(function(b){b.classList.toggle('active',b.dataset.k===sub)});
    $$('#rvxTrendView button').forEach(function(b){
      b.classList.toggle('active',b.dataset.view===state.metric);
      b.disabled=b.dataset.view==='count'&&sub!=='listening'&&sub!=='reading';
    });
    if(!has){$('rvaTrendSummary').innerHTML='';$('rv2RangeText').textContent='';$('rv2GoalText').textContent='';return}
    var last=pts[pts.length-1],vals=pts.map(function(p){return p.value}),hi=Math.max.apply(null,vals),avg=vals.reduce(function(a,b){return a+b},0)/vals.length;
    var tg=state.metric==='count'?targetCount(sub):num(targets()[sub]);
    var unit=state.metric==='count'?' 题':'';
    var delta=pts.length>1?last.value-pts[pts.length-2].value:null;
    var name=sub==='overall'?'总分':({listening:'听力',reading:'阅读',writing:'写作',speaking:'口语'}[sub]||'成绩');
    $('rvaTrendSummary').innerHTML=[
      ['最近',fmt(last.value)+unit,delta==null?'首条记录':(delta>=0?'较上次 +':'较上次 ')+fmt(delta)+unit],
      ['最高',fmt(hi)+unit,'共 '+pts.length+' 次'],
      ['平均',fmt(avg)+unit,'共 '+pts.length+' 次'],
      ['目标',tg==null?'未设':fmt(tg)+unit,tg==null?'去设置里填写':(last.value>=tg?'已达标':'差 '+fmt(tg-last.value)+unit)]
    ].map(function(x){return '<div><span>'+x[0]+'</span><b>'+x[1]+'</b><em>'+x[2]+'</em></div>'}).join('');
    $('rv2RangeText').textContent=name+' · '+md(pts[0].date)+' 至 '+md(last.date);
    $('rv2GoalText').textContent=tg==null?'目标未设':'目标 '+fmt(tg)+unit;
    drawChart($('rv2TrendCanvas'),{points:pts,target:tg,metric:state.metric,compact:false,tip:$('rvaTrendTip')});
  }

  function drawChart(canvas,opt){
    var wrap=canvas.parentElement,cs=getComputedStyle(wrap);
    var w=Math.max(120,wrap.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight));
    var h=Math.max(80,wrap.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom));
    var dpr=window.devicePixelRatio||1;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
    var ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var compact=!!opt.compact,points=opt.points,metric=opt.metric||'score',showY=!compact||h>=260;
    var padL=showY?34:10,padR=compact?12:18,padT=compact?14:18,padB=compact?25:30;
    var values=points.map(function(p){return Number(p.value)}),minY,maxY;
    if(metric==='count'){minY=0;maxY=Math.max.apply(null,values);maxY=Math.max(10,Math.ceil(maxY/5)*5)}
    else{
      var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values);
      minY=Math.max(0,Math.floor((lo-.5)*2)/2);maxY=Math.min(9,Math.ceil((hi+.5)*2)/2);
      if(opt.target!=null){minY=Math.min(minY,Math.max(0,opt.target-.5));maxY=Math.max(maxY,Math.min(9,opt.target+.5))}
      if(maxY-minY<1.5){var mid=(minY+maxY)/2;minY=Math.max(0,mid-.75);maxY=Math.min(9,mid+.75)}
    }
    var plotW=w-padL-padR,plotH=h-padT-padB;
    var X=function(i){return padL+(points.length===1?plotW/2:plotW*i/(points.length-1))};
    var Y=function(v){return padT+plotH*(1-(v-minY)/(maxY-minY))};
    ctx.lineWidth=1;
    var grid=[];
    if(metric==='count'){for(var g=0;g<=maxY+0.001;g+=maxY<=20?5:10)grid.push(g)}
    else if(maxY-minY>=6)grid=[0,3,6,9];
    else for(var gv=Math.ceil(minY*2)/2;gv<=maxY+0.001;gv+=.5)grid.push(Math.round(gv*2)/2);
    grid.forEach(function(v){
      var yy=Y(v);ctx.strokeStyle=COLORS.lineSoft;ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(w-padR,yy);ctx.stroke();
      if(showY){ctx.fillStyle=COLORS.muted;ctx.font='9.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(v%1===0?String(v):fmt(v),padL-8,yy)}
    });
    if(opt.target!=null){
      var ty=Y(opt.target);ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(47,125,118,.55)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(padL,ty);ctx.lineTo(w-padR,ty);ctx.stroke();ctx.restore();
      if(!compact){
        ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(47,125,118,.55)';ctx.beginPath();ctx.moveTo(padL,padT+4);ctx.lineTo(padL+16,padT+4);ctx.stroke();ctx.restore();
        ctx.fillStyle=COLORS.muted;ctx.font='9.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('目标 '+fmt(opt.target),padL+22,padT+4);
      }
    }
    var grad=ctx.createLinearGradient(0,padT,0,h-padB);grad.addColorStop(0,'rgba(58,154,147,.12)');grad.addColorStop(1,'rgba(58,154,147,0)');
    ctx.beginPath();points.forEach(function(p,i){var xx=X(i),yy=Y(p.value);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});
    ctx.lineTo(X(points.length-1),h-padB);ctx.lineTo(X(0),h-padB);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();points.forEach(function(p,i){var xx=X(i),yy=Y(p.value);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});
    ctx.strokeStyle=COLORS.teal;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    var step=points.length>8?2:1;
    points.forEach(function(p,i){
      var xx=X(i),yy=Y(p.value),last=i===points.length-1;
      ctx.beginPath();ctx.arc(xx,yy,last?4:3.2,0,Math.PI*2);ctx.fillStyle=last?COLORS.teal:COLORS.surface;ctx.fill();ctx.strokeStyle=COLORS.teal;ctx.lineWidth=1.8;ctx.stroke();
      if(!compact&&(i%step===0||last)){
        ctx.fillStyle=COLORS.muted;ctx.font='9.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textBaseline='top';
        ctx.textAlign=i===0?'left':(last?'right':'center');
        ctx.fillText(md(p.date),i===0?padL:(last?w-padR:xx),h-padB+7);
      }
    });
    if(!compact){
      var lp=points[points.length-1];
      ctx.fillStyle=COLORS.ink;ctx.font='700 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textAlign='right';ctx.textBaseline='bottom';
      ctx.fillText(metric==='count'?String(lp.value):fmt(lp.value),X(points.length-1),Math.max(padT+10,Y(lp.value)-7));
    }
    canvas._pts=points.map(function(p,i){return {x:X(i),y:Y(p.value),d:p.date,v:p.value}});
    canvas._metric=metric;
    if(opt.tip)bindTip(canvas,opt.tip);
  }
  function bindTip(canvas,tip){
    if(canvas._tipBound)return;canvas._tipBound=true;
    canvas.addEventListener('mousemove',function(e){
      var pts=canvas._pts||[],r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,best=null,bd=1e9;
      pts.forEach(function(p){var d=Math.abs(p.x-mx);if(d<bd){bd=d;best=p}});
      if(!best||bd>28){tip.classList.remove('on');return}
      tip.textContent=md(best.d)+' · '+(canvas._metric==='count'?best.v:fmt(best.v));
      tip.style.left=best.x+'px';tip.style.top=(best.y-8)+'px';tip.classList.add('on');
    });
    canvas.addEventListener('mouseleave',function(){tip.classList.remove('on')});
  }

  function renderRecords(){
    var all=recItems(),typed=all.filter(function(r){return state.recType==='all'||r.kind===state.recType});
    var list=typed;
    if(state.recRange==='days'){var from=dayOffset(-10);list=typed.filter(function(r){return String(r.date||'')>=from})}
    else if(state.recRange==='five')list=typed.slice(0,5);
    $('rvaRecTools').hidden=!all.length;
    document.querySelector('.rva-rec-head').hidden=!list.length;
    $('rvaRecEmpty').hidden=!!list.length;
    $$('#recAllChips button').forEach(function(b){b.classList.toggle('active',b.dataset.k===state.recType)});
    $('recordFilter').value=state.recRange;
    if(!list.length){
      $('recAll').innerHTML='';
      if(all.length){
        $('rvaRecEmpty').querySelector('b').textContent='这一栏还没有记录';
        $('rvaRecEmpty').querySelector('p').textContent='换个类型或范围看看。';
        $('rvaRecEmpty').querySelector('.rva-primary').hidden=true;
      }else{
        $('rvaRecEmpty').querySelector('b').textContent='还没有记录';
        $('rvaRecEmpty').querySelector('p').textContent='整卷、分项和口语模考都会汇总到这里，按日期排列。';
        $('rvaRecEmpty').querySelector('.rva-primary').hidden=false;
      }
      return;
    }
    var labels={whole:'整卷',part:'分项',speaking:'口语'};
    $('recAll').innerHTML=list.map(function(r){
      return '<button class="rva-rec-row" type="button" data-rv-record="'+esc(r.id)+'" data-kind="'+esc(r.kind)+'">'
        +'<span class="rva-rec-date">'+esc(md(r.date))+'</span>'
        +'<span class="rva-tag '+esc(r.kind)+'">'+esc(labels[r.kind]||'记录')+'</span>'
        +'<span class="rva-rec-title">'+esc(r.title)+'</span>'
        +'<span class="rva-rec-score">'+esc(r.main)+'<small>'+esc(r.mainLabel)+'</small></span>'
        +'<span class="rva-rec-arrow">›</span></button>';
    }).join('');
  }

  function show(pane,opt){
    if(!TABS.some(function(t){return t.id===pane}))pane='home';
    state.pane=pane;
    $$('.hub-main [data-rv-pane]').forEach(function(p){p.hidden=p.dataset.rvPane!==pane});
    $$('[data-rv-tab]').forEach(function(b){
      var on=b.dataset.rvTab===pane;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');
    });
    if(pane==='home')renderHome();else if(pane==='trend')renderTrend();else renderRecords();
    var main=document.querySelector('#reviewMain .hub-main');if(main)main.scrollTop=0;window.scrollTo(0,0);
    if(!(opt&&opt.silent)){try{history.replaceState(null,'','#rv='+pane)}catch(e){}}
  }
  function renderAll(){renderNav();show(state.pane,{silent:true})}

  function openDetail(id,kind){
    var raw=null,t=targets();
    if(kind==='whole')raw=(DATA.scores||[]).filter(function(x){return String(x.id)===String(id)})[0];
    else raw=mockRecords().filter(function(x){return String(x.id)===String(id)})[0];
    if(!raw)return;
    var body=$('rv2DetailBody');
    if(kind==='whole'){
      var total=overall(raw);
      body.innerHTML='<div class="rva-detail-score"><b>'+fmt(total)+'</b><span>总分 / 9</span></div>'
        +'<div class="rva-detail-sub">'+SUBS.map(function(s){
          var v=num(raw[s.k]),tg=num(t[s.k]),weak=tg!=null&&v<tg;
          return '<div class="'+(weak?'is-weak':'')+'"><span>'+s.n+'</span><b>'+fmt(v)+'</b><small>'+(tg==null?'目标未设':'目标 '+fmt(tg))+'</small></div>';
        }).join('')+'</div><div class="rva-detail-meta">'+esc(raw.date)+(raw.note?' · '+esc(raw.note):'')+'</div>';
    }else{
      var title=raw.note||(raw.type&&typeof MOCK_TYPES!=='undefined'&&MOCK_TYPES[raw.type]?MOCK_TYPES[raw.type].name:'练习记录');
      var score=recItems().filter(function(x){return String(x.id)===String(id)})[0];
      body.innerHTML='<div class="rva-detail-score"><b>'+fmt(score?score.main:raw.overall)+'</b><span>'+(score?score.mainLabel:'分数')+'</span></div>'
        +'<div class="rva-detail-meta">'+esc(raw.date)+'<br>'+esc(title)+'</div>';
    }
    body.insertAdjacentHTML('beforeend','<div class="rva-detail-del"><button type="button" data-rv-delete="'+esc(id)+'" data-kind="'+esc(kind)+'">删除这条记录</button></div>');
    var d=$('rv2DetailDialog');if(d&&!d.open)d.showModal();
  }
  function deleteRecord(id,kind){
    /* 11-18 她报「删除这条记录点了没反应」：旧写法去 #rvLegacy（hidden）里找对应按钮再 .click()，
       但详情里的「模考自动记录」是 mock 类型，#mockHistoryList 没渲染出对应按钮 → orig 为 null，啥也不做。
       改为直接改 DATA + hubSave + 重绘，不依赖隐藏 DOM（日期/确认文案按类型给）。 */
    if(id==null)return;
    var list=(kind==='whole'&&typeof DATA!=='undefined'&&DATA)?DATA.scores:DATA.mockRecords;
    if(!Array.isArray(list))return;
    var rec=list.filter(function(x){return x&&String(x.id)===String(id)})[0];
    if(!rec)return;
    var label=(kind==='whole'?String(rec.date||''):String(rec.date||'')+' 的记录');
    if(!confirm('确定删除'+label+'？此操作不可恢复。'))return;
    if(kind==='whole')DATA.scores=list.filter(function(x){return String(x.id)!==String(id)});
    else DATA.mockRecords=list.filter(function(x){return String(x.id)!==String(id)});
    DATA.deletedIds=DATA.deletedIds||[];
    if(!DATA.deletedIds.some(function(x){return String(x)===String(id)}))DATA.deletedIds.push(id);
    try{if(typeof hubSave==='function')hubSave()}catch(e){}
    var d=$('rv2DetailDialog');if(d&&d.open)d.close();
    renderAll();
    try{if(typeof repaintReview==='function')repaintReview()}catch(e){}
  }
  function openAdd(){
    var d=$('rv2AddDialog');if(!d)return;
    addCounts={whole:scores().length,part:mockRecords().length};
    var dt=$('scoreDate');if(dt&&!dt.value)dt.value=today();
    var dm=$('mkDate');if(dm&&!dm.value)dm.value=today();
    if(!d.open)d.showModal();
  }
  function onSaveClick(e){
    var btn=e.target&&e.target.closest?e.target.closest('#addScore,#mkAdd'):null;
    if(!btn||btn.disabled)return;
    var whole=btn.id==='addScore',before=whole?addCounts.whole:addCounts.part;
    setTimeout(function(){
      var after=whole?scores().length:mockRecords().length;
      if(before!=null&&after>before){
        var d=$('rv2AddDialog');if(d&&d.open)d.close();
        renderAll();
      }
    },50);
  }

  function todayItems(){
    try{
      if(typeof DATA==='undefined'||!DATA||!Array.isArray(DATA.plans))return [];
      var k=typeof todayKey==='function'?todayKey():today();
      for(var i=0;i<DATA.plans.length;i++)if(DATA.plans[i]&&DATA.plans[i].date===k)return Array.isArray(DATA.plans[i].items)?DATA.plans[i].items:[];
    }catch(e){}
    return [];
  }
  function taskMeta(it){
    var out=[],min=Number(it&&it.min),text=String(it&&it.text||''),m=text.match(/(\d+(?:\.\d+)?)\s*分钟/);
    if(!min&&m)min=parseFloat(m[1]);if(min)out.push(Math.round(min)+' 分钟');
    var labels={listening:'听力',reading:'阅读',writing:'写作',speaking:'口语',mix:'综合'};
    if(it&&labels[it.module])out.push(labels[it.module]);
    return out.join(' · ');
  }
  function renderTasks(force){
    var box=$('hubTdList');if(!box)return;
    if(!force&&box.children.length)return;
    fallbackTasks=true;
    var items=todayItems().filter(Boolean),done=items.filter(function(x){return x.done}),sorted=items.filter(function(x){return !x.done}).concat(done);
    box.innerHTML=sorted.map(function(it){
      var meta=taskMeta(it);
      return '<button class="hub-task'+(it.done?' done':'')+'" type="button" data-hub-todo="'+esc(it.id)+'" aria-pressed="'+(it.done?'true':'false')+'"><span class="hub-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span><span class="hub-tx"><b>'+esc(it.text||'')+'</b>'+(meta?'<small>'+esc(meta)+'</small>':'')+'</span></button>';
    }).join('');
    var cnt=$('hubTdCount');if(cnt){cnt.textContent=done.length+'/'+items.length;cnt.hidden=!items.length}
    var empty=$('hubTdEmpty');if(empty)empty.hidden=!!items.length;
  }
  function toggleTask(id){
    var arr=todayItems();
    for(var i=0;i<arr.length;i++)if(arr[i]&&String(arr[i].id)===String(id)){
      arr[i].done=!arr[i].done;arr[i].updatedAt=Date.now();
      try{if(typeof hubSave==='function')hubSave()}catch(e){}
      renderTasks(true);
      try{document.dispatchEvent(new CustomEvent('hub:plan-toggled',{detail:{id:id}}))}catch(e){}
      return;
    }
  }

  function onClick(e){
    var t=e.target;if(!t||!t.closest)return;
    var tab=t.closest('[data-rv-tab]');
    if(tab){e.preventDefault();show(tab.dataset.rvTab);return}
    var go=t.closest('[data-go]');
    if(go){e.preventDefault();show(go.dataset.go);return}
    var jump=t.closest('[data-rv-jump]');
    if(jump){
      e.preventDefault();var k=jump.dataset.rvJump;
      var map={listening:'bank.html?ch=listening',reading:'bank.html?ch=reading',writing:'writing.html',speaking:'speaking.html',settings:'settings.html?pane=targets',bank:'bank.html'};
      if(map[k])location.href=map[k];return;
    }
    var add=t.closest('[data-rv2-add]');
    if(add){e.preventDefault();openAdd();return}
    var kind=t.closest('.rv2-kind [data-kind]');
    if(kind){
      e.preventDefault();$$('.rv2-kind button').forEach(function(b){b.classList.toggle('active',b===kind)});
      var w=$('scAddWrap'),p=$('mkAddWrap');if(w)w.hidden=kind.dataset.kind!=='whole';if(p)p.hidden=kind.dataset.kind!=='part';return;
    }
    if(t.closest('[data-close-detail]')){e.preventDefault();var dd=$('rv2DetailDialog');if(dd&&dd.open)dd.close();return}
    var del=t.closest('[data-rv-delete]');
    if(del){e.preventDefault();deleteRecord(del.dataset.rvDelete,del.dataset.kind);return}
    var rec=t.closest('[data-rv-record]');
    if(rec){e.preventDefault();openDetail(rec.dataset.rvRecord,rec.dataset.kind);return}
    if(fallbackTasks&&!window.__hubSideClick){
      var task=t.closest('.hub-task[data-hub-todo]');
      if(task){e.preventDefault();toggleTask(task.dataset.hubTodo);return}
    }
    if(t.closest('[data-home-range] button')){
      var r=t.closest('[data-home-range] button');state.homeRange=r.dataset.range;
      $$('[data-home-range] button').forEach(function(b){b.classList.toggle('active',b===r)});renderMini();return;
    }
    if(t.closest('#rvxTrendChips button')){
      var sb=t.closest('#rvxTrendChips button');state.subject=sb.dataset.k;
      if(state.metric==='count'&&state.subject!=='listening'&&state.subject!=='reading')state.metric='score';
      renderTrend();return;
    }
    if(t.closest('#rvxTrendView button')){
      var mb=t.closest('#rvxTrendView button');if(mb.disabled)return;state.metric=mb.dataset.view;renderTrend();return;
    }
    if(t.closest('#recAllChips button')){
      state.recType=t.closest('#recAllChips button').dataset.k;renderRecords();return;
    }
  }
  function onChange(e){
    if(e.target&&e.target.id==='recordFilter'){state.recRange=e.target.value;renderRecords()}
  }
  function hashPane(){
    var h=(location.hash||'').replace('#','');if(h.indexOf('rv=')===0)h=h.slice(3);
    return TABS.some(function(t){return t.id===h})?h:null;
  }
  function resize(){
    clearTimeout(window.__rvResizeT);
    window.__rvResizeT=setTimeout(function(){if(state.pane==='home')renderMini();else if(state.pane==='trend')renderTrend()},120);
  }
  function bind(){
    if(window.__rvFinalClick)document.removeEventListener('click',window.__rvFinalClick);
    window.__rvFinalClick=onClick;document.addEventListener('click',onClick);
    if(window.__rvFinalChange)document.removeEventListener('change',window.__rvFinalChange);
    window.__rvFinalChange=onChange;document.addEventListener('change',onChange);
    if(window.__rvFinalSave)document.removeEventListener('click',window.__rvFinalSave);
    window.__rvFinalSave=onSaveClick;document.addEventListener('click',onSaveClick);
    if(window.__rvFinalHash)window.removeEventListener('hashchange',window.__rvFinalHash);
    window.__rvFinalHash=function(){var p=hashPane();if(p&&p!==state.pane)show(p,{silent:true})};window.addEventListener('hashchange',window.__rvFinalHash);
    if(window.__rvFinalMerge)document.removeEventListener('hub:data-merged',window.__rvFinalMerge);
    window.__rvFinalMerge=function(){setTimeout(renderAll,60)};document.addEventListener('hub:data-merged',window.__rvFinalMerge);
    if(window.__rvFinalResize)window.removeEventListener('resize',window.__rvFinalResize);
    window.__rvFinalResize=resize;window.addEventListener('resize',resize);
  }
  function boot(){
    bind();
    renderNav();
    renderTasks(false);
    show(hashPane()||'home',{silent:true});
    window.hubRepaintReviewE=renderAll;
    window.__rvTabs={show:show,render:renderAll};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
