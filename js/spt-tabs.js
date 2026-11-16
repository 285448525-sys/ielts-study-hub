(function(){
  'use strict';
  /* SPEAKING-MAIN-2（2026-11-16）：口语固定五格「题库 / 陪练 / 素材 / 模考 / 记录」。
     只负责导航、版式和只读呈现；题库、陪练、素材生成/编辑、模考、评分与保存继续复用原脚本。
     旧 #tabs 仍是业务转发点，所有既有 ID、data-*、懒加载链与数据结构不删不改。 */
  var TABS=[
    {id:'bank',nm:'题库',ic:'book'},
    {id:'practice',nm:'陪练',ic:'chat'},
    {id:'materials',nm:'素材',ic:'layers'},
    {id:'mock',nm:'模考',ic:'target'},
    {id:'records',nm:'记录',ic:'table'}
  ];
  var ICON={
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  var VIEWS=['listView','detailView','mockView','matView','sentView','coachView'];
  var PANES=['sptPaneHome','sptPaneRecords','sptPaneWeak','sptPaneMock'];
  var DIM=[['fc','流利性与连贯性'],['lr','词汇丰富度'],['gra','语法多样性及准确性']];
  var current='bank';
  var recordMode='practice';
  var recordFilter='all';
  var materialKey='';
  var materialSearch='';
  var materialRemove='';
  var mockLoading=false;

  function $(id){return document.getElementById(id)}
  function data(){return typeof DATA!=='undefined'&&DATA?DATA:{}}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function ic(k,cls){return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.book)+'</svg>'}
  function num(v){var n=Number(v);return isFinite(n)?n:null}
  function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):'—'}
  function pad2(n){return String(n).length<2?'0'+n:String(n)}
  function dateOf(ts){var d=new Date(ts);return isFinite(d.getTime())?d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()):''}
  function timeOf(ts){try{return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}catch(e){return ''}}
  function bank(){return (Array.isArray(data().speaking)?data().speaking:[]).filter(function(s){return s&&!s.framework&&!/^sp_p[12]_\d+$/.test(s.id||'')})}
  function promptOf(s){return (s&&(s.titleEn||s.title||s.promptEn))||''}
  function practiceCount(s){if(typeof window.getPracticeCount==='function'){try{return window.getPracticeCount(s)}catch(e){}}return 0}
  function agg(s){if(typeof window.getAggScore==='function'){try{return window.getAggScore(s)}catch(e){}}return null}
  function lastTs(s){if(typeof window.lastPracticeTs==='function'){try{return window.lastPracticeTs(s)}catch(e){}}return 0}
  function target(){var t=data().settings&&data().settings.targets||{};var s=parseFloat(t.speaking),o=parseFloat(t.overall);return s>0?s:(o>0?o:null)}
  function mocks(){
    return (Array.isArray(data().mockRecords)?data().mockRecords:[]).filter(function(r){return r&&(r.kind==='speaking'||(!Array.isArray(r.parts)&&r.p1))}).sort(function(a,b){return (num(b.ts)||0)-(num(a.ts)||0)||String(b.date||'').localeCompare(String(a.date||''))});
  }
  function records(){
    var out=[];
    bank().forEach(function(s){
      var answers=s.answers||{};
      Object.keys(answers).forEach(function(k){
        var a=answers[k];
        var q=s.type==='P1'?((s.questions||[])[Number(k)]||s.titleEn||s.title||''):(s.promptEn||s.titleEn||s.title||'');
        (a&&Array.isArray(a.records)?a.records:[]).forEach(function(r,i){if(r&&num(r.ts))out.push({s:s,key:k,index:i,r:r,ts:num(r.ts),q:q})});
      });
    });
    return out.sort(function(a,b){return b.ts-a.ts});
  }
  function score(r){return r&&r.r&&r.r.score&&r.r.score.basis&&r.r.score.overall!=null?num(r.r.score.overall):null}

  function renderNav(){
    var box=$('sptMobileTabs');
    if(box)box.innerHTML=TABS.map(function(t){return '<button type="button" data-spt-tab="'+t.id+'">'+esc(t.nm)+'</button>'}).join('');
    var side=$('hubSubs');
    if(side)side.innerHTML=TABS.map(function(t){return '<button class="hub-sub" type="button" data-spt-tab="'+t.id+'"><span class="hub-sub-ic">'+ic(t.ic)+'</span><span class="hub-sub-nm">'+esc(t.nm)+'</span></button>'}).join('');
    syncActive();
  }
  function syncActive(){
    document.querySelectorAll('[data-spt-tab]').forEach(function(b){
      var on=b.getAttribute('data-spt-tab')===current;
      b.classList.toggle('on',on);
      if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  function hidePanes(){PANES.forEach(function(id){var el=$(id);if(el)el.hidden=true})}
  function hideViews(){VIEWS.forEach(function(id){var el=$(id);if(el)el.hidden=true})}
  function hideAll(){hidePanes();hideViews()}
  function legacyTab(type){var b=document.querySelector('#tabs [data-type="'+type+'"]');if(b){try{b.click();return true}catch(e){}}return false}

  function show(id,opts){
    if(id==='mat'||id==='materials')id='materials';
    if(id==='home'||id==='weak')id=id==='weak'?'records':'bank';
    if(!TABS.some(function(t){return t.id===id}))return;
    current=id;
    hideAll();
    if(id==='bank'){
      legacyTab('BANK');
    }else if(id==='practice'){
      legacyTab('PRACTICE');
      var c=$('coachView'),s=$('sentView');
      if(s)s.hidden=true;
      if(c)c.hidden=false;
    }else if(id==='materials'){
      showMaterials();
    }else if(id==='mock'){
      var pane=$('sptPaneMock');if(pane)pane.hidden=false;
      renderMock();
    }else if(id==='records'){
      var rp=$('sptPaneRecords');if(rp)rp.hidden=false;
      renderRecords();
    }
    syncActive();
    if(!(opts&&opts.silent)){try{history.replaceState(null,'','#spt='+id)}catch(e){}}
    try{document.dispatchEvent(new CustomEvent('spt:tab',{detail:{id:id}}))}catch(e){}
  }
  function showMaterials(){
    var mv=$('matView');
    if(mv)mv.hidden=false;
    var shell=$('sptMatShell'),wrap=$('sptMatLegacyWrap');
    if(wrap)wrap.hidden=true;
    if(shell)shell.hidden=false;
    renderMaterialShell();
    if(typeof window.lateLoad==='function'){
      window.lateLoad('matView').then(function(){
        try{if(window.matGen&&window.matGen.init)window.matGen.init()}catch(e){console.error('[speaking] 素材初始化失败',e)}
        renderMaterialShell();
      });
    }
  }
  function openTopic(id){
    if(!id)return;
    current='bank';
    hidePanes();
    if(typeof window.openDetail==='function'){
      try{window.openDetail(id);syncActive();return}catch(e){}
    }
    show('bank');
  }
  async function startMock(){
    if(mockLoading)return;
    mockLoading=true;renderMock();
    if(typeof window.authVipCheck==='function'){
      var vipOk=null;
      try{vipOk=await window.authVipCheck()}catch(e){}
      if(vipOk!==true){
        if(typeof window.toast==='function')window.toast(vipOk===null?'会员状态暂时没查到，稍后再试':'口语模考是会员专属，开会员后每周可以考 10 场');
        mockLoading=false;renderMock();
        return;
      }
    }
    var go=function(){
      mockLoading=false;
      legacyTab('MOCK');
      renderMock();
    };
    if(typeof window.lateLoad==='function'){
      window.lateLoad('mockView').then(go).catch(function(){mockLoading=false;renderMock();legacyTab('MOCK')});
    }else go();
  }

  function renderMock(){
    var box=$('sptMockIntro');if(!box)return;
    var ms=mocks(),last=ms[0];
    box.innerHTML=''
      +'<section class="spt-mock-shell">'
      +'<div class="spt-mock-hero"><div class="spt-mock-kicker">FULL SPEAKING TEST</div><h1>完整口语模考</h1><p>P1 → P2 → P3 · 约 12–15 分钟</p><div class="spt-mock-clock"><b>12–15</b><span>MIN</span></div><button type="button" class="spt-btn primary" data-spt-start-mock'+(mockLoading?' disabled':'')+'>'+(mockLoading?'正在准备…':'开始完整模考 '+ic('arrow'))+'</button></div>'
      +'<div class="spt-mock-flow">'
        +'<div class="spt-mock-part" data-n="01"><span>PART 1</span><b>日常问答</b><p>4–5 分钟，围绕熟悉的话题回答。</p></div>'
        +'<div class="spt-mock-part" data-n="02"><span>PART 2</span><b>个人陈述</b><p>准备 1 分钟，连续陈述约 2 分钟。</p></div>'
        +'<div class="spt-mock-part" data-n="03"><span>PART 3</span><b>深入讨论</b><p>4–5 分钟，围绕 P2 话题继续追问。</p></div>'
      +'</div>'
      +'</section>'
      +'<div class="spt-mock-note">'+ic('clock')+'中途退出或刷新，可以继续本场考试。</div>'
      +(last?'<div class="spt-mock-recent"><h2>最近一次</h2><div class="spt-record-row"><span class="spt-record-score">'+one(last.overall)+'</span><span class="spt-record-main"><b>完整口语模考</b><small>'+esc(last.date||dateOf(last.ts))+' · AI 预估</small></span><span class="spt-record-actions"><button type="button" data-spt-record="mock">查看报告</button></span></div></div>':'');
  }

  function emptyRecords(title,desc,btn,go){
    return '<div class="spt-record-empty"><span class="spt-empty-ic">'+ic('table')+'</span><b>'+esc(title)+'</b><p>'+esc(desc)+'</p>'+(btn?'<button type="button" class="spt-btn primary" data-spt-go="'+esc(go)+'">'+esc(btn)+'</button>':'')+'</div>';
  }
  function filteredRecords(){
    var all=records();
    if(recordFilter!=='all')all=all.filter(function(r){return r.s.type===recordFilter});
    return all;
  }
  function renderRecords(){
    var box=$('sptRecordsBody');if(!box)return;
    document.querySelectorAll('[data-spt-record-mode]').forEach(function(b){
      var on=b.getAttribute('data-spt-record-mode')===recordMode;
      b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');
    });
    var weak=$('sptRecordsWeak');if(weak)weak.hidden=recordMode!=='practice';
    if(recordMode==='mock'){
      var ms=mocks();
      if(!ms.length){box.innerHTML=emptyRecords('还没有完整模考','考完 P1、P2、P3 后，整套报告会保存在这里。','开始一次模考','mock');return}
      box.innerHTML='<div class="spt-record-toolbar"><span>'+ms.length+' 场完整模考</span><button type="button" class="spt-btn" data-spt-go="mock" style="margin-left:auto">再考一场</button></div><div id="sptMockHistoryList"></div>';
      var list=$('sptMockHistoryList');
      if(window.MockHistory&&window.MockHistory.render)window.MockHistory.render(list);
      else if(list){
        list.innerHTML='<div class="spt-record-empty"><b>报告模块还在载入</b><p>请稍等片刻。</p></div>';
        if(typeof window.lateLoad==='function')window.lateLoad('mockView').then(function(){if(current==='records'&&recordMode==='mock')renderRecords()});
      }
      return;
    }
    var all=filteredRecords();
    if(!all.length){
      box.innerHTML=emptyRecords('还没有逐题练习','从题库选一题，写下回答并提交后，就能在这里回练。','去题库选一题','bank');
    }else{
      box.innerHTML='<div class="spt-record-toolbar"><div class="spt-seg">'+['all','P1','P2'].map(function(k){return '<button type="button" class="'+(recordFilter===k?'on':'')+'" data-spt-record-filter="'+k+'">'+(k==='all'?'全部':k)+'</button>'}).join('')+'</div><select class="spt-select" id="sptRecordRange" aria-label="记录时间范围"><option value="all">全部时间</option><option value="30">近 30 天</option><option value="90">近 90 天</option></select><span>'+all.length+' 次回答</span></div>'
        +'<div class="spt-record-list">'+all.slice(0,80).map(function(r){
          var v=score(r);
          return '<article class="spt-record-row" data-record-ts="'+r.ts+'"><span class="spt-record-score">'+(v!=null?one(v):'—')+'</span><span class="spt-record-main"><b>'+esc(promptOf(r.s))+'</b><small>'+esc(r.s.type)+' · '+esc(dateOf(r.ts).slice(5))+' '+esc(timeOf(r.ts))+'</small></span><span class="spt-record-actions"><button type="button" data-spt-open="'+esc(r.s.id)+'" data-spt-review="1">回看</button><button type="button" data-spt-open="'+esc(r.s.id)+'" data-spt-replay="1">再练</button></span></article>';
        }).join('')+'</div>';
      var rg=$('sptRecordRange');
      if(rg)rg.value=window.__sptRange||'all';
    }
    renderWeak();
  }
  function applyRecordRange(){
    var rg=$('sptRecordRange');if(!rg)return;
    var n=rg.value==='all'?0:Number(rg.value);
    var cut=n?Date.now()-n*864e5:0;
    document.querySelectorAll('#sptRecordsBody .spt-record-row[data-record-ts]').forEach(function(row){
      row.hidden=!!(cut&&Number(row.getAttribute('data-record-ts'))<cut);
    });
    window.__sptRange=rg.value;
  }
  function dims(r){
    var parts=r&&r.parts||{},out=[];
    DIM.forEach(function(d){
      var vv=['p1','p2','p3'].map(function(k){return num(parts[k]&&parts[k][d[0]])}).filter(function(n){return n!=null});
      if(vv.length)out.push({name:d[1],v:vv.reduce(function(a,b){return a+b},0)/vv.length});
    });
    var p=num(r&&r.pronunciationScore);
    if(p!=null)out.push({name:'发音（设置分）',v:p});
    return out;
  }
  function renderWeak(){
    var box=$('sptRecordsWeak');if(!box)return;
    var ms=mocks(),last=ms[0],t=target(),ds=dims(last).sort(function(a,b){return a.v-b.v});
    var pr=bank().filter(function(s){return practiceCount(s)>0}).map(function(s){return {s:s,v:agg(s),ts:lastTs(s)}}).filter(function(x){return x.v!=null}).sort(function(a,b){return a.v-b.v}).slice(0,5);
    var h='<section class="spt-weak-section"><div class="spt-section-h"><h2>偏弱项</h2><span>'+(last?esc(last.date||dateOf(last.ts))+' · 最近一场模考':'完成一场模考后按真实评分显示')+'</span></div>';
    if(!ds.length){
      h+='<p class="spt-note">还没有分项评分。完成一套完整模考后，这里会按实际结果排序。</p>';
    }else{
      h+='<div class="spt-dim-list">'+ds.map(function(d,i){return '<div class="spt-dim"><div><b>'+esc(d.name)+'</b><span>'+(i===0?'本场相对偏低':'AI 预估')+'</span></div><span class="spt-dim-track"><i style="width:'+Math.max(0,Math.min(100,d.v/9*100))+'%"></i>'+(t?'<i class="spt-goal" style="left:'+Math.min(100,t/9*100)+'%"></i>':'')+'</span><strong>'+one(d.v)+'</strong></div>'}).join('')+'</div>'
        +'<p class="spt-note">'+(t?'竖线为目标 '+one(t)+'；':'未设置目标分；')+'发音若出现，来自设置中的固定分。</p>';
    }
    h+='</section>';
    if(pr.length){
      h+='<section class="spt-weak-section"><div class="spt-section-h"><h2>优先回练</h2><span>按已有逐题评分</span></div><div class="spt-weak-topics">'+pr.map(function(x){return '<button type="button" data-spt-open="'+esc(x.s.id)+'"><span><b>'+esc(promptOf(x.s))+'</b><small>'+esc(x.s.type)+' · '+esc(dateOf(x.ts))+'</small></span><strong>'+one(x.v)+'</strong><span class="spt-text-link">回练 '+ic('arrow')+'</span></button>'}).join('')+'</div></section>';
    }
    box.innerHTML=h;
  }

  function materialStore(){return data().materials&&typeof data().materials==='object'?data().materials:null}
  function materialList(){var st=materialStore();return st&&Array.isArray(st.materials)?st.materials.filter(Boolean):[]}
  function materialId(m,i){return m&&m.id!=null?String(m.id):'index:'+i}
  function selectedMaterial(){
    var list=materialList(),hit=null;
    for(var i=0;i<list.length;i++){if(materialId(list[i],i)===materialKey){hit=list[i];break}}
    if(!hit&&list.length){hit=list[0];materialKey=materialId(hit,0)}
    return hit;
  }
  function materialLogic(text){
    return String(text||'').split(/\n+/).map(function(x){return x.replace(/^\s*(?:[-•·]|\d+[.)、])\s*/,'').trim()}).filter(Boolean);
  }
  function renderMaterialShell(){
    var shell=$('sptMatShell');if(!shell)return;
    var list=materialList();
    var q=materialSearch.trim().toLowerCase();
    var shown=!q?list:list.filter(function(m){return (String(m.title||'')+' '+String(m.storyEn||'')+' '+String(m.logicZh||'')).toLowerCase().indexOf(q)>=0});
    var m=selectedMaterial();
    if(m&&q&&shown.indexOf(m)<0){m=shown[0]||null;materialKey=m?materialId(m,list.indexOf(m)):''}
    var toolbar='<div class="spt-mat-toolbar"><label class="spt-mat-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="sptMatSearch" type="search" placeholder="搜索素材" value="'+esc(materialSearch)+'"></label><button type="button" class="spt-btn" data-spt-mat-new>生成素材</button><button type="button" class="spt-btn" data-spt-mat-import>导入素材</button>'+(list.length>1?'<button type="button" class="spt-btn" data-spt-mat-manage>批量管理</button>':'')+'<span class="spt-mat-count">'+list.length+' 张素材</span></div>';
    if(!list.length){
      // 没有任何素材时不再显示空态，直接复用现成的生成引导页（有旧进度则回旧问卷）。
      openMaterialLegacy();
      return;
    }
    if(!shown.length){
      shell.innerHTML=toolbar+'<div class="spt-mat-empty"><div><b>没有找到素材</b><p>换一个关键词试试。</p></div></div>';
      return;
    }
    var idx=shown.map(function(x){
      var key=materialId(x,list.indexOf(x));
      return '<button type="button" class="spt-mat-item'+(m&&materialId(m,list.indexOf(m))===key?' on':'')+'" data-spt-mat="'+esc(key)+'"><span class="spt-mat-pin">'+(x.pinned?'★':'')+'</span><span><b>'+esc(x.title||'未命名素材')+'</b><small>'+((Array.isArray(x.coverage)?x.coverage.length:0)?'能串 '+x.coverage.length+' 道题':'我的素材')+'</small></span></button>';
    }).join('');
    var body='';
    if(m){
      var story=String(m.storyEn||'').trim();
      var spine=Array.isArray(m.spineEn)?m.spineEn.filter(function(x){return String(x||'').trim()}):[];
      var logic=materialLogic(m.logicZh);
      body='<article class="spt-mat-detail"><header class="spt-mat-detail-head"><div class="spt-mat-detail-title"><h2>'+esc(m.title||'未命名素材')+'</h2><p>'+(m.pinned?'最熟素材 · ':'')+(Array.isArray(m.coverage)?m.coverage.length:0)+' 道题可用</p></div><div class="spt-mat-actions"><button type="button" data-spt-mat-pin="'+esc(materialId(m,list.indexOf(m)))+'" class="'+(m.pinned?'on':'')+'">'+(m.pinned?'取消置顶':'置顶')+'</button><button type="button" data-spt-mat-edit="'+esc(materialId(m,list.indexOf(m)))+'">编辑</button><button type="button" class="danger" data-spt-mat-delete="'+esc(materialId(m,list.indexOf(m)))+'">删除</button></div></header><div class="spt-mat-detail-body">'
        +(spine.length?'<section class="spt-mat-sec"><h3>最小骨架</h3><ul class="spt-mat-spine">'+spine.map(function(x,i){return '<li><i>'+pad2(i+1)+'</i><span>'+esc(x)+'</span></li>'}).join('')+'</ul></section>':'')
        +(story?'<section class="spt-mat-sec"><h3>完整故事</h3><div class="spt-mat-story">'+esc(story).replace(/\n/g,'<br>')+'</div></section>':'')
        +(logic.length?'<section class="spt-mat-sec"><h3>中文逻辑</h3><ul class="spt-mat-logic">'+logic.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></section>':'')
        +(materialRemove===materialId(m,list.indexOf(m))?'<div class="spt-mat-remove"><span>删除后这张素材不再出现。</span><button type="button" data-spt-mat-delete-confirm="'+esc(materialId(m,list.indexOf(m)))+'">确认删除</button><button type="button" data-spt-mat-delete-cancel>取消</button></div>':'')
        +'</div></article>';
    }
    shell.innerHTML=toolbar+'<div class="spt-mat-grid"><aside class="spt-mat-index"><div class="spt-mat-index-head"><span>我的素材</span><span>'+shown.length+' 张</span></div><div class="spt-mat-list">'+idx+'</div></aside>'+body+'</div>';
  }
  function openMaterialLegacy(intent){
    var shell=$('sptMatShell'),wrap=$('sptMatLegacyWrap');
    if(shell)shell.hidden=true;
    if(wrap)wrap.hidden=false;
    var apply=function(){
      try{if(window.matGen&&window.matGen.init)window.matGen.init()}catch(e){console.error('[speaking] 素材初始化失败',e)}
      window.setTimeout(function(){
        var host=$('sptMatLegacy')||$('matView');
        if(!host)return;
        if(intent==='generate'){
          var gen=host.querySelector('#matGen');
          if(gen)gen.click();
        }else if(intent==='import'){
          var add=host.querySelector('#matAddMatToggle');
          if(add){add.click();window.setTimeout(function(){var t=host.querySelector('#matAddMatText');if(t){try{t.scrollIntoView({behavior:'smooth',block:'center'});t.focus()}catch(e){}}},80)}
          else{
            var q=host.querySelector('#matGen');
            if(q)q.click();
          }
        }else if(intent==='bulk'){
          var bulk=host.querySelector('#matBulkEnter');if(bulk)bulk.click();
        }
      },120);
    };
    if(typeof window.lateLoad==='function')window.lateLoad('matView').then(apply);else apply();
  }
  function findMaterial(key){
    var list=materialList();
    for(var i=0;i<list.length;i++){if(materialId(list[i],i)===key)return {m:list[i],i:i,key:key}}
    return null;
  }
  function persistMaterials(){
    try{
      if(typeof hubSave==='function')hubSave();
      if(data().settings&&data().settings.autoSync&&data().settings.syncCode&&typeof cloudUpload==='function')cloudUpload(true);
    }catch(e){}
  }
  function pinMaterial(key){
    var hit=findMaterial(key);if(!hit)return;
    var st=materialStore();if(!st)return;
    hit.m.pinned=!hit.m.pinned;
    if(hit.m.pinned)st.materials=st.materials.filter(function(x){return x&&x.pinned}).concat(st.materials.filter(function(x){return !x||!x.pinned}));
    st.materialsEpoch=Date.now();
    persistMaterials();renderMaterialShell();
    try{toast(hit.m.pinned?'已置顶为最熟素材':'已取消置顶')}catch(e){}
  }
  function deleteMaterial(key){
    var hit=findMaterial(key);if(!hit)return;
    var st=materialStore();if(!st)return;
    if(hit.m.id!=null){
      st.deletedIds=Array.isArray(st.deletedIds)?st.deletedIds:[];
      if(st.deletedIds.indexOf(hit.m.id)<0)st.deletedIds.push(hit.m.id);
    }
    st.materials.splice(hit.i,1);
    st.materialsEpoch=Date.now();
    materialRemove='';materialKey='';
    persistMaterials();renderMaterialShell();
    try{toast('已删除素材')}catch(e){}
  }
  function editMaterial(key){
    var hit=findMaterial(key);if(!hit)return;
    openMaterialLegacy('edit');
    window.setTimeout(function(){
      var host=$('sptMatLegacy')||$('matView');
      var card=host&&host.querySelector('.mat-mat[data-i="'+hit.i+'"]');
      if(!card)return;
      var head=card.querySelector('[data-toggle]');
      if(head&&!card.classList.contains('open'))head.click();
      var edit=card.querySelector('[data-edit]');
      if(edit)edit.click();
      try{card.scrollIntoView({behavior:'smooth',block:'center'})}catch(e){}
    },180);
  }

  function onClick(e){
    var t=e.target;if(!t||!t.closest)return;
    var nav=t.closest('[data-spt-tab]');
    if(nav){e.preventDefault();show(nav.getAttribute('data-spt-tab'));return}
    var go=t.closest('[data-spt-go]');
    if(go){e.preventDefault();var id=go.getAttribute('data-spt-go');show(id);return}
    if(t.closest('[data-spt-start-mock]')){e.preventDefault();startMock();return}
    var rm=t.closest('[data-spt-record-mode]');
    if(rm){e.preventDefault();recordMode=rm.getAttribute('data-spt-record-mode');renderRecords();return}
    var rr=t.closest('[data-spt-record]');
    if(rr){e.preventDefault();recordMode=rr.getAttribute('data-spt-record');show('records');return}
    var rf=t.closest('[data-spt-record-filter]');
    if(rf){e.preventDefault();recordFilter=rf.getAttribute('data-spt-record-filter');renderRecords();return}
    var op=t.closest('[data-spt-open]');
    if(op){
      e.preventDefault();openTopic(op.getAttribute('data-spt-open'));
      if(op.hasAttribute('data-spt-replay'))window.setTimeout(function(){var a=document.querySelector('#detailBody textarea');if(a){try{a.focus();a.scrollIntoView({block:'center'})}catch(e){}}},180);
      return;
    }
    if(t.closest('[data-spt-mat-new]')){e.preventDefault();openMaterialLegacy('generate');return}
    if(t.closest('[data-spt-mat-import]')){e.preventDefault();openMaterialLegacy('import');return}
    if(t.closest('[data-spt-mat-manage]')){e.preventDefault();openMaterialLegacy('bulk');return}
    var mi=t.closest('[data-spt-mat]');
    if(mi){e.preventDefault();materialKey=mi.getAttribute('data-spt-mat');materialRemove='';renderMaterialShell();return}
    var mp=t.closest('[data-spt-mat-pin]');
    if(mp){e.preventDefault();pinMaterial(mp.getAttribute('data-spt-mat-pin'));return}
    var me=t.closest('[data-spt-mat-edit]');
    if(me){e.preventDefault();editMaterial(me.getAttribute('data-spt-mat-edit'));return}
    var md=t.closest('[data-spt-mat-delete]');
    if(md){e.preventDefault();materialRemove=md.getAttribute('data-spt-mat-delete');renderMaterialShell();return}
    var mc=t.closest('[data-spt-mat-delete-confirm]');
    if(mc){e.preventDefault();deleteMaterial(mc.getAttribute('data-spt-mat-delete-confirm'));return}
    if(t.closest('[data-spt-mat-delete-cancel]')){e.preventDefault();materialRemove='';renderMaterialShell();return}
  }
  function onInput(e){
    if(e.target&&e.target.id==='sptMatSearch'){
      materialSearch=e.target.value||'';
      var pos=e.target.selectionStart;
      renderMaterialShell();
      var box=$('sptMatSearch');
      if(box){box.focus();try{box.setSelectionRange(pos,pos)}catch(_){}}
    }
  }
  function onChange(e){if(e.target&&e.target.id==='sptRecordRange')applyRecordRange()}

  function inferCurrent(){
    if($('mockView')&&!$('mockView').hidden)return 'mock';
    if($('matView')&&!$('matView').hidden)return 'materials';
    if($('coachView')&&!$('coachView').hidden)return 'practice';
    if($('detailView')&&!$('detailView').hidden)return 'bank';
    return 'bank';
  }
  function observe(){
    if(window.__sptViewObs){try{window.__sptViewObs.disconnect()}catch(e){}}
    var obs=new MutationObserver(function(muts){
      var changed=false;
      for(var i=0;i<muts.length;i++){
        var el=muts[i].target;
        if(el&&el.hidden)continue;
        if(el&&VIEWS.indexOf(el.id)>=0){changed=true;break}
      }
      if(!changed)return;
      if($('mockView')&&!$('mockView').hidden){current='mock';hidePanes()}
      else if($('matView')&&!$('matView').hidden){current='materials';hidePanes()}
      else if($('coachView')&&!$('coachView').hidden){current='practice';hidePanes()}
      else if($('detailView')&&!$('detailView').hidden){current='bank';hidePanes()}
      else if($('listView')&&!$('listView').hidden){current='bank';hidePanes()}
      syncActive();
    });
    VIEWS.forEach(function(id){var el=$(id);if(el)obs.observe(el,{attributes:true,attributeFilter:['hidden']})});
    window.__sptViewObs=obs;
  }
  function bind(){
    if(window.__sptClick2)document.removeEventListener('click',window.__sptClick2);
    window.__sptClick2=onClick;document.addEventListener('click',onClick);
    if(window.__sptInput2)document.removeEventListener('input',window.__sptInput2);
    window.__sptInput2=onInput;document.addEventListener('input',onInput);
    if(window.__sptChange2)document.removeEventListener('change',window.__sptChange2);
    window.__sptChange2=onChange;document.addEventListener('change',onChange);
    if(window.__sptHash2)window.removeEventListener('hashchange',window.__sptHash2);
    window.__sptHash2=function(){var id=hashId();if(id)show(id,{silent:true})};window.addEventListener('hashchange',window.__sptHash2);
    if(window.__sptMerge2)document.removeEventListener('hub:data-merged',window.__sptMerge2);
    window.__sptMerge2=function(){
      if(current==='records')renderRecords();
      else if(current==='materials')renderMaterialShell();
      else if(current==='mock')renderMock();
    };
    document.addEventListener('hub:data-merged',window.__sptMerge2);
    observe();
  }
  function hashId(){
    var h=(location.hash||'').replace(/^#/,'');
    if(h.indexOf('spt=')===0)h=h.slice(4);
    if(h==='materials'||h==='mat')return 'materials';
    if(h==='home')return 'bank';
    if(h==='weak')return 'records';
    return TABS.some(function(t){return t.id===h})?h:null;
  }
  function subId(){
    try{
      var q=typeof tbSubPending==='function'?String(tbSubPending('speaking')||''):new URLSearchParams(location.search).get('sub')||'';
      return {BANK:'bank',PRACTICE:'practice',MAT:'materials',MOCK:'mock',RECORD:'records',RECORDS:'records'}[q]||null;
    }catch(e){return null}
  }
  function boot(){
    renderNav();bind();
    var h=hashId(),s=subId();
    if(h||s){show(h||s,{silent:true});return}
    var q='';
    try{q=location.search||''}catch(e){}
    if(/[?&](open|senttab|drill|autostart)=/.test(q)){
      current=inferCurrent();
      syncActive();
      return;
    }
    show('bank',{silent:true});
  }
  window.__sptTabs={
    show:show,
    renderNav:renderNav,
    renderPane:function(id){
      if(id==='records')renderRecords();
      else if(id==='materials')renderMaterialShell();
      else if(id==='mock')renderMock();
      else renderNav();
    },
    cur:function(){return current}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
