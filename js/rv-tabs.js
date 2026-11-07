(function(){
  'use strict';
  /* REVIEW-TABS-1（11-07，她「回顾页面我看了做的很好可以直接做进去了」）
     把 design/REVIEW-TABS-1-回顾页侧栏各页UI样子稿-2026-11-07.html 的 5 个左栏 tab 落进真页面。
     做法沿用单词页已验证的那套：页面专属脚本 + 按 data-rv-pane 分组显隐，
       · 不动 7 页共用的 js/hub-side-shell.js（动它要 7 页串号）；
       · 既有真实模块一个不删、ID 一个不改（rvx-data.js / rec-all.js / scores.js 照常写它们）；
       · 左栏 5 tab 用属性 data-rv-tab（不是共用脚本的 data-hub-sub，避开 syncActive/onClick 误伤）；
       · 数字全部现场算真字段，稿子里的示意数字一个不用，算不出就留空态、不编百分比。
     真字段：DATA.scores（rvx-data.js scores()）、DATA.settings.targets（targets()）、
       overall()/scores.js、examCountdown()/common.js、calcStreak()/common.js、
       DATA.sessions、DATA.mockRecords、RecAll.collect()。
     软导航契约：本文件会随每轮 window.eval 重跑，监听必须先 remove 再 add（bind()）。
     // TODO: [待确认] 设计稿里的「导出」与「录入」：录入成绩复用站内既有 #rv2AddDialog 弹窗
       （rvx-data.js:221 的 data-rv2-add 委托，本笔没动）；导出 PDF/CSV 她没点头，本笔不做。
     // TODO: [待确认] 设计稿「分项 40 题答对数」是否真落库未核，本笔考试记录页直接复用
       既有 #recAll（RecAll.collect()），不另造表、不编数字。 */
  var SUBJ=[{k:'listening',n:'听力'},{k:'reading',n:'阅读'},{k:'writing',n:'写作'},{k:'speaking',n:'口语'}];
  var TABS=[
    {id:'home',nm:'总览',ic:'grid'},
    {id:'trend',nm:'成绩趋势',ic:'line'},
    {id:'subjects',nm:'四科表现',ic:'layers'},
    {id:'records',nm:'考试记录',ic:'table'},
    {id:'effort',nm:'学习投入',ic:'cal'}
  ];
  var ICON={
    grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    line:'<path d="M3 3v18h18"/><path d="m6 15 4-5 3 3 5-7"/>',
    layers:'<path d="M12 2 3 7l9 5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
  };
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function $(id){return document.getElementById(id)}
  function ic(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.grid)+'</svg>'}
  function num(v){var n=Number(v);return isFinite(n)?n:null}
  function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):'—'}
  function pad2(n){return String(n).length<2?('0'+n):String(n)}
  function dayAdd(d,n){ if(typeof window.addDays==='function'){try{return window.addDays(d,n)}catch(e){}} var dt=new Date(d+'T00:00:00');dt.setDate(dt.getDate()+n);return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate()) }
  function today(){ if(typeof window.todayKey==='function'){try{return window.todayKey()}catch(e){}} var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()) }
  function sc(){ if(typeof window.scores==='function'){try{return window.scores()}catch(e){}} var a=(typeof DATA!=='undefined'&&Array.isArray(DATA.scores))?DATA.scores.slice():[];return a.sort(function(x,y){return String(x&&x.date||'').localeCompare(String(y&&y.date||''))}) }
  function tg(){ if(typeof window.targets==='function'){try{return window.targets()}catch(e){}} return (typeof DATA!=='undefined'&&DATA.settings&&DATA.settings.targets)||{} }
  function ov(r){ var l=num(r.listening),rr=num(r.reading),w=num(r.writing),s=num(r.speaking); if(l==null||rr==null||w==null||s==null)return null; if(typeof window.overall==='function'){try{return window.overall(l,rr,w,s)}catch(e){}} return Math.round(((l+rr+w+s)/4)*2)/2 }
  function cd(){ if(typeof window.examCountdown==='function'){try{return window.examCountdown()}catch(e){}} return {hasExam:false,daysLeft:null,md:'',label:''} }
  function streak(){ if(typeof window.calcStreak==='function'){try{return window.calcStreak()}catch(e){}} return 0 }
  function recCount(){ try{ if(typeof RecAll!=='undefined'&&RecAll.collect) return RecAll.collect().length }catch(e){} var m=(typeof DATA!=='undefined'&&Array.isArray(DATA.mockRecords))?DATA.mockRecords.length:0; return sc().length+m }
  function byDay(){ var m={}; try{ var a=(typeof DATA!=='undefined'&&Array.isArray(DATA.sessions))?DATA.sessions:[]; a.forEach(function(x){var d=String(x&&x.date||'').slice(0,10); if(!d)return; m[d]=(m[d]||0)+(num(x&&x.durationSec)||0)}) }catch(e){} return m }

  function statHtml(cards){
    return cards.map(function(c){
      return '<div class="rv-stat'+(c.ok?' ok':'')+'">'
        +'<div class="k">'+esc(c.k)+'</div>'
        +'<div class="v'+(c.tone?' '+c.tone:'')+'">'+c.v+(c.unit?'<small>'+esc(c.unit)+'</small>':'')+'</div>'
        +'<div class="d">'+esc(c.d||'')+'</div></div>';
    }).join('');
  }
  function panelHead(title,hint){ return '<div class="rv-panel-h"><b>'+esc(title)+'</b>'+(hint?'<span>'+esc(hint)+'</span>':'')+'</div>' }

  /* 总览：4 数卡 + 水平标尺（不是百分比环）+ 结论条，全部现算 */
  function renderHome(){
    var s=sc(),t=tg(),last=s[s.length-1];
    var st=$('rvHomeStats'),ru=$('rvRuler'),ca=$('rvCallout');
    if(!last){ if(st)st.innerHTML=''; if(ru)ru.hidden=true; if(ca)ca.hidden=true; return }
    var all=ov(last),tv=num(t.overall)||0;
    var weak=SUBJ.filter(function(x){var g=num(t[x.k])||0;return g>0&&num(last[x.k])!=null&&num(last[x.k])<g});
    var c=cd();
    if(st)st.innerHTML=statHtml([
      {k:'最近一次总分',v:one(all),unit:'/ 9',d:String(last.date||'').slice(5)+' · 按四科平均进位',ok:true,tone:'teal'},
      {k:'距目标分'+(tv?' '+one(tv):''),v:tv?((all>=tv)?'已达标':'差 '+one(tv-all)):'未设目标',d:tv?'四科平均按官方进位':'去设置里填目标分',tone:tv?(all>=tv?'teal':'warn'):''},
      {k:'还没到目标分的科',v:String(weak.length),unit:'科',d:weak.length?weak.map(function(x){return x.n}).join('、'):'四科均已达标',tone:weak.length?'warn':''},
      {k:c.hasExam?'距 '+(c.md||'考试'):'考试日期',v:(c.hasExam&&c.daysLeft!=null)?String(c.daysLeft):'未设置',unit:(c.hasExam&&c.daysLeft!=null)?'天':'',d:c.hasExam?'按已设考试日':'去设置里填考试日期'}
    ]);
    if(ru){ ru.hidden=false;
      var gp=tv>0?Math.min(100,Math.round(tv/9*100)):null;
      var cp=Math.min(100,Math.round((all||0)/9*100));
      ru.innerHTML='<div class="rv-panel"><div class="rv-ruler-head"><b>总分与目标</b><span>水平标尺，不是完成度百分比</span></div>'
        +'<div class="rv-ruler-track"><i style="width:'+cp+'%"></i>'
        +(gp!=null?'<span class="rv-ruler-goal" style="left:'+gp+'%"></span>':'')
        +'<span class="rv-ruler-cur" style="left:'+cp+'%"></span></div>'
        +'<div class="rv-ruler-ticks"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>';
    }
    if(ca){ ca.hidden=false;
      if(weak.length){ var mx=0;weak.forEach(function(x){var g=Math.round((((num(t[x.k])||0)-(num(last[x.k])||0)))*2)/2;if(g>mx)mx=g});
        ca.innerHTML='<div class="rv-callout"><div><b>'+esc(weak.map(function(x){return x.n}).join('、'))+' 还差 '+one(mx)+' 分到目标</b><p>已到目标分的科目先稳住，再做整套练习。</p></div></div>';
      }else{ ca.innerHTML='<div class="rv-callout"><div><b>'+(tv?'四科都到了目标分':'还没设目标分')+'</b><p>'+(tv?'按自己的节奏继续。':'去设置里填好四科目标，这里会告诉你先补哪一科。')+'</p></div></div>' }
    }
  }

  /* 成绩趋势页：既有真实折线（.rv2-content）保留，这里补 4 数卡 */
  function renderTrend(){
    var el=$('rvTrendStats');if(!el)return;
    var vals=sc().map(ov).filter(function(v){return v!=null});
    if(!vals.length){el.innerHTML='';return}
    var tv=num(tg().overall)||0;
    var max=Math.max.apply(null,vals),l3=vals.slice(-3),avg=l3.reduce(function(a,b){return a+b},0)/l3.length;
    var cons=0;if(tv){for(var i=vals.length-1;i>=0;i--){if(vals[i]>=tv)cons++;else break}}
    el.innerHTML=statHtml([
      {k:'最高一次',v:one(max),d:'近 '+vals.length+' 次记录',ok:true,tone:'teal'},
      {k:'近 3 次均值',v:one(avg),d:'±0.5 参考带'},
      {k:'连续达标',v:tv?String(cons):'—',unit:tv?'次':'',d:tv?('总分 ≥ '+one(tv)):'未设目标分'},
      {k:'已记录',v:String(vals.length),unit:'次',d:'整套真题'}
    ]);
  }

  /* 四科表现：横条（目标竖线）+ 四轴雷达（最近一次 vs 首次），真分数 */
  function renderSubjects(){
    var s=sc(),t=tg(),last=s[s.length-1],first=s[0];
    var bars=$('rvSubjBars'),radar=$('rvRadar');
    if(!last){ if(bars)bars.innerHTML='<div class="rv-panel"><div class="rv-empty">录入一次成绩后，这里会显示四科与目标分的距离。</div></div>'; if(radar)radar.innerHTML=''; return }
    if(bars){
      var rows=SUBJ.map(function(x){var v=num(last[x.k]),tv=num(t[x.k])||0;var wp=v!=null?Math.min(100,Math.round(v/9*100)):0;var gp=tv>0?Math.min(100,Math.round(tv/9*100)):null;var weak=tv>0&&v!=null&&v<tv;
        return '<div class="rv-subj-row"><span class="rv-subj-n">'+esc(x.n)+'</span>'
          +'<span class="rv-subj-track"><i class="rv-fill'+(weak?' weak':'')+'" style="width:'+wp+'%"></i>'+(gp!=null?'<i class="rv-goal" style="left:'+gp+'%"></i>':'')+'</span>'
          +'<span class="rv-subj-v">'+one(v)+' <small>'+(tv>0?(weak?'差 '+one(tv-v):'达标'):'—')+'</small></span></div>'}).join('');
      bars.innerHTML='<div class="rv-panel">'+panelHead('四科与目标','竖线 = 目标分，黄条 = 还没到')+rows+'</div>';
    }
    if(radar){
      function poly(rec){ return SUBJ.map(function(x,i){var v=num(rec&&rec[x.k]);var r=v!=null?110*v/9:0;if(i===0)return '160,'+(150-r);if(i===1)return (160+r)+',150';if(i===2)return '160,'+(150+r);return (160-r)+',150'}).join(' ') }
      var g='';[1,0.66,0.33].forEach(function(f){ g+='<polygon points="'+[[160,150-110*f],[160+110*f,150],[160,150+110*f],[160-110*f,150]].map(function(p){return p.join(',')}).join(' ')+'" fill="none" stroke="var(--rv2-line,#e8ebec)" stroke-width="1"/>' });
      var hasFirst=first&&first!==last;
      var fp=hasFirst?'<polygon points="'+poly(first)+'" fill="none" stroke="var(--rv2-muted,#7a8580)" stroke-width="1.8" stroke-dasharray="5 4"/>':'';
      var lp='<polygon points="'+poly(last)+'" fill="var(--primary,#5cb3ab)" fill-opacity=".16" stroke="var(--primary,#5cb3ab)" stroke-width="2.2"/>';
      radar.innerHTML='<div class="rv-panel">'+panelHead('四科轮廓','最近一次'+(hasFirst?' vs 首次':''))+'<div class="rv-radar-box"><svg viewBox="0 0 320 300">'+g+fp+lp
        +'<text x="160" y="28" text-anchor="middle" class="rv-radar-lab">听力</text><text x="292" y="154" text-anchor="start" class="rv-radar-lab">阅读</text>'
        +'<text x="160" y="292" text-anchor="middle" class="rv-radar-lab">写作</text><text x="28" y="154" text-anchor="end" class="rv-radar-lab">口语</text></svg>'
        +'<div class="rv-radar-legend"><span><i></i>最近一次</span>'+(hasFirst?'<span><i class="first"></i>首次</span>':'')+'</div></div></div>';
    }
  }

  /* 学习投入：连胜/日均/累计 数卡 + 学习日历热力图 + 近 14 天时长柱，全部读 DATA.sessions */
  function renderEffort(){
    var m=byDay(),dates=Object.keys(m).sort();
    var st=$('rvEffortStats'),heat=$('rvHeat'),bars=$('rvBars');
    if(!dates.length){ if(st)st.innerHTML=''; if(heat)heat.innerHTML='<div class="rv-panel"><div class="rv-empty">还没有学习记录。开始一次学习并结算后，这里会累计天数与时长。</div></div>'; if(bars)bars.innerHTML=''; return }
    var total=dates.reduce(function(a,d){return a+m[d]},0);
    var maxRun=1,run=1;for(var i=1;i<dates.length;i++){if(dates[i]===dayAdd(dates[i-1],1)){run++;if(run>maxRun)maxRun=run}else run=1}
    var tk=today(),cut=dayAdd(tk,-29),recent=dates.filter(function(d){return d>=cut});
    var rsec=recent.reduce(function(a,d){return a+m[d]},0);
    var avgH=recent.length?(rsec/3600/recent.length):0;
    if(st)st.innerHTML=statHtml([
      {k:'连续学习',v:String(streak()),unit:'天',d:'当前连胜',ok:true,tone:'teal'},
      {k:'最长连续',v:String(maxRun),unit:'天',d:'历史最好'},
      {k:'日均学习',v:avgH.toFixed(1),unit:'小时',d:'近 30 天'},
      {k:'累计学习',v:(total/3600).toFixed(1),unit:'小时',d:'共 '+dates.length+' 天有记录'}
    ]);
    if(heat){ var cells='';for(var j=83;j>=0;j--){var d=dayAdd(tk,-j),h=m[d]||0;var lv=h<=0?0:h<1800?1:h<3600?2:h<7200?3:4;
        cells+='<i class="'+(lv?'l'+lv:'')+'" title="'+esc(d.slice(5))+' · '+(h?(h/3600).toFixed(1)+' 小时':'没学')+'"></i>' }
      heat.innerHTML='<div class="rv-panel">'+panelHead('学习日历','近 12 周 · 深浅 = 当天学习时长，悬停看数字')
        +'<div class="rv-heat-box"><div class="rv-heat">'+cells+'</div><div class="rv-heat-legend"><span>少</span>'
        +'<i style="background:#eef2f2"></i><i style="background:#dcefeb"></i><i style="background:#b8ded7"></i><i style="background:#86c7bd"></i><i style="background:var(--primary,#5cb3ab)"></i><span>多</span></div></div></div>';
    }
    if(bars){ var arr=[],mh=0;for(var k=13;k>=0;k--){var d2=dayAdd(tk,-k),h2=(m[d2]||0)/3600;arr.push([d2,h2]);if(h2>mh)mh=h2}if(mh<=0)mh=1;
      var hh='',ll='';arr.forEach(function(p,idx){hh+='<div class="rv-bar'+(idx===arr.length-1?' today':'')+'"><em>'+(p[1]?p[1].toFixed(1):'')+'</em><i style="height:'+Math.round(p[1]/mh*100)+'%"></i></div>';ll+='<span>'+(idx%2===0?p[0].slice(5):'')+'</span>'});
      bars.innerHTML='<div class="rv-panel">'+panelHead('近 14 天学习时长','单位：小时')+'<div class="rv-chart"><div class="rv-bars">'+hh+'</div><div class="rv-bar-labels">'+ll+'</div></div></div>';
    }
  }

  function renderNav(){
    var box=$('rvNav');if(!box)return;
    var badges={trend:sc().length,records:recCount(),effort:streak()};
    box.innerHTML=TABS.map(function(t){var n=badges[t.id];
      return '<button class="hub-sub" type="button" data-rv-tab="'+t.id+'"><span class="hub-sub-ic">'+ic(t.ic)+'</span>'
        +'<span class="hub-sub-nm">'+esc(t.nm)+'</span>'+(n?'<span class="hub-sub-n">'+esc(n)+'</span>':'')+'</button>'}).join('');
    var m=$('rvMobileTabs');if(m)m.innerHTML=TABS.map(function(t){return '<button type="button" data-rv-tab="'+t.id+'">'+esc(t.nm)+'</button>'}).join('');
    syncActive();
  }
  function syncActive(){ var cur=window.__rvCur||'home'; document.querySelectorAll('[data-rv-tab]').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-rv-tab')===cur) }) }
  function valid(id){ return TABS.some(function(t){return t.id===id}) }
  function renderPane(id){
    renderNav();
    if(id==='home')renderHome();
    else if(id==='trend')renderTrend();
    else if(id==='subjects')renderSubjects();
    else if(id==='effort')renderEffort();
    /* records 页用既有 #recAll（rec-all.js / rvx-data.js 渲染），不另造表 */
  }
  function show(id,opts){
    if(!valid(id))return;
    window.__rvCur=id;
    document.querySelectorAll('.hub-main [data-rv-pane]').forEach(function(p){ p.hidden=p.getAttribute('data-rv-pane')!==id });
    var rc=document.querySelector('.rv2-content');
    if(rc){ var vis=rc.querySelectorAll('[data-rv-pane]:not([hidden])').length; rc.hidden=(vis===0); rc.classList.toggle('rv-one-col',vis===1); }
    syncActive();
    renderPane(id);
    try{ var hm=document.querySelector('.hub-main');if(hm)hm.scrollTop=0; var main=document.querySelector('main.container');if(main)main.scrollTop=0 }catch(e){}
    try{ if(typeof window.hubResetPageScroll==='function')window.hubResetPageScroll(); if(typeof window.hubFitPageScroll==='function')window.hubFitPageScroll() }catch(e){}
    if(!(opts&&opts.silent)){ try{ history.replaceState(null,'','#rv='+id) }catch(e){} }
    try{ document.dispatchEvent(new CustomEvent('rv:tab',{detail:{id:id}})) }catch(e){}
  }
  function hashId(){ var h=(location.hash||'').replace('#','');if(h.indexOf('rv=')===0)h=h.slice(3);return valid(h)?h:null }
  function subId(){ try{var p=new URLSearchParams(location.search),q=p.get('sub')||'';if(p.get('rec'))return 'records';if(q==='record'||q==='trajectory'||q==='history')return 'records';if(q)return 'home'}catch(e){} return null }
  function onClick(e){ var t=e.target;if(!t||!t.closest)return;var b=t.closest('[data-rv-tab]');if(b){e.preventDefault();show(b.getAttribute('data-rv-tab'))} }
  function bind(){
    if(window.__rvClick){try{document.removeEventListener('click',window.__rvClick)}catch(e){}}
    window.__rvClick=onClick;document.addEventListener('click',onClick);
    if(window.__rvMerge){try{document.removeEventListener('hub:data-merged',window.__rvMerge)}catch(e){}}
    window.__rvMerge=function(){renderNav();renderPane(window.__rvCur||'home')};document.addEventListener('hub:data-merged',window.__rvMerge);
    if(window.__rvHash){try{window.removeEventListener('hashchange',window.__rvHash)}catch(e){}}
    window.__rvHash=function(){var id=hashId();if(id&&id!==window.__rvCur)show(id,{silent:true})};window.addEventListener('hashchange',window.__rvHash);
  }
  function boot(){ renderNav();bind();show(hashId()||subId()||'home',{silent:true}) }
  window.__rvTabs={show:show,renderNav:renderNav,renderPane:renderPane,cur:function(){return window.__rvCur}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
