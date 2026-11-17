(function(){
  'use strict';
  var TABS = [
    {id:'study', nm:'背词', ic:'study'},
    {id:'books', nm:'词书', ic:'book'},
    {id:'wrong', nm:'错词', ic:'wrong'},
    {id:'data', nm:'数据', ic:'data'}
  ];
  var ICON = {
    study:'<path d="M4 19.5V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14M4 19.5A2.5 2.5 0 0 1 6.5 17H19M8 7h7M8 11h5"/>',
    book:'<path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/>',
    wrong:'<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1zM9.5 8.5l5 5M14.5 8.5l-5 5"/>',
    data:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    set:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    sound:'<path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  var MODE = {visual:'看词选义', audio:'听音选义', dictation:'听写', self:'自评'};
  var META = {
    custom:{overline:'MY · WORDS', index:'00', source:'我的自定义词库', desc:'从练习与查词中手动收藏的单词', priority:'按需复习'},
    rdtext:{overline:'IELTS · READING', index:'01', source:'剑桥雅思阅读真题', desc:'剑雅阅读文章，按出现频次筛选', priority:'高频必背'},
    qstem:{overline:'IELTS · QUESTION STEM', index:'02', source:'剑雅阅读题干高频表达', desc:'定位词、同义替换与题干常用搭配', priority:'题眼优先'},
    lstext:{overline:'IELTS · LISTENING', index:'03', source:'剑桥雅思听力原文', desc:'高频场景词与同义替换', priority:'听力必背'},
    phr:{overline:'IELTS · COLLOCATION', index:'04', source:'阅读 / 听力高频搭配', desc:'按真题语境整理的词组与固定表达', priority:'写作可复用'},
    awl:{overline:'AWL · ACADEMIC', index:'05', source:'Academic Word List', desc:'学术阅读与写作通用的核心词族', priority:'学术优先'},
    lstans:{overline:'IELTS · LISTENING', index:'06', source:'剑雅听力填空答案', desc:'听力填空题中的真实答案词', priority:'拼写必背'}
  };
  var selectedBook = '', statRange = 7, activeWord = null, wrongLoadToken = 0;
  function $(id){return document.getElementById(id);}
  function esc(s){return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(n){var v = Number(n);return isFinite(v) && v > 0 ? v : 0;}
  function ic(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICON[name]+'</svg>';}
  function setText(id, value){var el=$(id);if(el)el.textContent=value == null ? '' : value;}
  function books(){return window.__WM_BOOKS || [];}
  function active(){try{return typeof wbActive === 'function' ? wbActive() : 'custom';}catch(e){return 'custom';}}
  function cfg(){try{return typeof pc === 'function' ? pc() : {};}catch(e){return {};}}
  function book(id){return books().filter(function(b){return b.id===id;})[0] || books()[0] || {id:'custom',nm:'我的词库',mt:''};}
  function total(id){try{if(typeof window.wmCount === 'function')return num(window.wmCount(book(id)));}catch(e){}return 0;}
  function wordFromBank(en, bankId){
    var key=String(en||'').trim().toLowerCase(), list=[];
    try{list=bankId==='custom' ? (DATA.words||[]) : ((window.__OB.banks[bankId]||{}).words||[]);}catch(e){}
    return list.filter(function(w){return w && String(w.en||'').trim().toLowerCase()===key;})[0] || null;
  }
  function prog(bankId, en){
    if(bankId==='custom')return wordFromBank(en,bankId)||{};
    try{return (window.__OB.banks[bankId].prog||{})[String(en).toLowerCase()]||{};}catch(e){return {};}
  }
  function counts(id){
    var mastered=0, learning=0, list=[];
    try{
      if(id==='custom')list=DATA.words||[];
      else if(window.__OB.banks[id])list=Object.keys(window.__OB.banks[id].prog||{}).map(function(en){return {en:en};});
    }catch(e){}
    list.forEach(function(w){
      var p=prog(id,w.en), level=num(p.level);
      if(p.cleared===true && level>=5)mastered++;
      else if(level>0 || p.lastReview)learning++;
    });
    var tot=total(id);
    return {m:mastered,l:learning,n:Math.max(0,tot-mastered-learning),t:tot};
  }
  function hashTab(){var m=/(?:^#|&)wb=([a-z]+)/.exec(location.hash||'');return m&&['study','books','wrong','data','home'].indexOf(m[1])>=0?m[1]:'';}
  function hashId(){return hashTab()||'study';}
  function renderNav(){
    var nav=$('wbNav'), current=window.__wbCur||'study';if(!nav)return;
    nav.innerHTML=TABS.map(function(t){return '<button class="hub-sub'+(t.id===current?' on':'')+'" type="button" data-wb-tab="'+t.id+'"><span class="hub-sub-ic">'+ic(t.ic)+'</span><span class="hub-sub-nm">'+t.nm+'</span></button>';}).join('')+
      '<button class="hub-sub wb-settings-nav" type="button" data-wb-settings><span class="hub-sub-ic">'+ic('set')+'</span><span class="hub-sub-nm">设置</span></button>';
    var mobile=$('wbMobileTabs');
    if(mobile)mobile.innerHTML=TABS.map(function(t){return '<button class="'+(t.id===current?'on':'')+'" type="button" data-wb-tab="'+t.id+'">'+t.nm+'</button>';}).join('')+
      '<button class="wb-mobile-set" type="button" data-wb-settings aria-label="设置" title="设置">'+ic('set')+'</button>';
  }
  function panes(){return Array.prototype.slice.call(document.querySelectorAll('#bankView .wb-pane, #vMall, #vBook, #wmLegacy'));}
  function show(id, opts){
    opts=opts||{};window.__wbCur=id;renderNav();
    if(id==='study'){
      $('bankView').hidden=true;$('studyView').hidden=false;
      try{switchWordTab('study',false);}catch(e){}
      try{if(window.__wdSetView)window.__wdSetView('start');}catch(e){}
      renderStudy();
    }else{
      if(!$('studyView').hidden){try{switchWordTab('bank');}catch(e){}}
      panes().forEach(function(p){p.hidden=true;});
      var pane=document.querySelector('#bankView [data-wb-pane="'+id+'"]');
      if(pane)pane.hidden=false;
      if(id==='home'){var mall=$('vMall');if(mall)mall.hidden=false;try{if(window.__wmShowMall)window.__wmShowMall();if(window.__wmRender)window.__wmRender();}catch(e){}}
    if(id==='wrong'){renderWrong();loadWrongBanks();}
    if(id==='data')renderStat();
      if(id==='books')renderBooks();
    }
    if(!opts.silent){try{history.replaceState(null,'',location.pathname+location.search+'#wb='+id);}catch(e){}}
    try{if(typeof hubResetPageScroll==='function')hubResetPageScroll();if(typeof hubFitPageScroll==='function')hubFitPageScroll();}catch(e){}
  }
  function renderStudy(){
    var current=active(), c=counts(current), pct=c.t?Math.min(100,Math.round(c.m/c.t*100)):0;
    setText('wbStudyBook',book(current).nm);setText('wbStudyCount','已掌握 '+c.m+' / '+c.t);
    setText('wbStudyPct',pct+'%');setText('wbStudyM',c.m);setText('wbStudyL',c.l);setText('wbStudyN',c.n);
    var bar=$('wbStudyTrack');if(bar)bar.style.width=pct+'%';
    var mode=$('wbStudyModes');if(mode)mode.innerHTML=Object.keys(MODE).map(function(id){return '<button type="button" class="'+(cfg().questionMode===id?'on':'')+'" data-wb-mode="'+id+'">'+MODE[id]+'</button>';}).join('');
    var word=null;
    try{var list=typeof wbWords==='function'?wbWords():[];word=list.filter(function(w){return w&&w.en&&w.cleared!==true;})[0]||list[0];}catch(e){}
    setText('wbPreviewWord',word?word.en:'—');setText('wbPreviewIpa',word?word.ipa||'':'');
    setText('wbPreviewCn',word?((word.pos?word.pos+' ':'')+(word.cn||'')):'');
    setText('wbPreviewMode',MODE[cfg().questionMode]||MODE.visual);
    $('wbPreviewCard').disabled=!word;
    activeWord=word?{en:word.en,bankId:current,d:word,wrong:false}:null;
    if(word && current!=='custom' && !wbLoaded(current)){obBankReady(current).then(function(){renderStudy();}).catch(function(){});}
    try{if(window.__wdRefreshToday)window.__wdRefreshToday();}catch(e){}
  }
  function wrongData(){
    var out=[], seen={};
    function add(en,bankId){
      var key=String(en||'').trim().toLowerCase();
      if(!key || seen[bankId+'|'+key] || (DATA.wrongRemoved&&DATA.wrongRemoved[bankId+'|'+key]))return;
      seen[bankId+'|'+key]=1;
      var d=wordFromBank(key,bankId);
      out.push({en:key,bankId:bankId,d:d,cn:d?d.cn||'':'',ipa:d?d.ipa||'':'',pos:d?d.pos||'':'',eg:d?d.eg||'':'',w:d,wrong:true});
    }
    var days=DATA.dailyWrong||{};Object.keys(days).forEach(function(day){(days[day]||[]).forEach(function(en){add(en,'custom');});});
    try{Object.keys(window.__OB.banks||{}).forEach(function(id){var dw=window.__OB.banks[id].wrong||{};Object.keys(dw).forEach(function(day){(dw[day]||[]).forEach(function(en){add(en,id);});});});}catch(e){}
    return out;
  }
  function loadWrongBanks(){
    var token=++wrongLoadToken, ids=[];
    wrongData().forEach(function(x){if(x.bankId!=='custom'&&ids.indexOf(x.bankId)<0)ids.push(x.bankId);});
    if(!ids.length)return;
    Promise.all(ids.map(function(id){return obBankReady(id).catch(function(){});})).then(function(){
      if(token===wrongLoadToken&&window.__wbCur==='wrong')renderWrong();
    });
  }
  function renderWrong(){
    var all=wrongData(), box=$('wbWrongList'), empty=$('wbWrongEmpty');setText('wbWrongCount',all.length?all.length+' 个词':'');
    if(!box)return;
    box.innerHTML=all.map(function(x,index){
      return '<article class="wv-word" data-wrong-index="'+index+'"><button class="wv-word-open" type="button" data-wb-review="'+index+'"><span class="wv-word-title">'+esc(x.en)+'</span><span class="wv-word-ipa">'+esc(x.ipa)+'</span><span class="wv-word-cn">'+esc((x.pos?x.pos+' ':'')+x.cn)+'</span></button><div class="wv-word-actions"><button class="wv-icon-btn" type="button" data-wb-say="'+esc(x.en)+'" title="发音" aria-label="播放发音">'+ic('sound')+'<span>发音</span></button><button class="wv-review-btn" type="button" data-wb-review="'+index+'" title="回看">'+ic('eye')+'<span>回看</span></button><button class="wv-icon-btn wv-delete" type="button" data-wb-remove="'+index+'" title="移出" aria-label="移出错词">'+ic('trash')+'<span>移出</span></button></div></article>';
    }).join('');
    box.hidden=!all.length;empty.hidden=!!all.length;
    var review=$('wbWrongReview');if(review)review.disabled=!all.some(function(x){return !!x.w;});
    if(review)review.hidden=!all.length;
  }
  function openWord(item){
    if(!item)return;activeWord=item;
    setText('wbWordTitle',item.en);setText('wbWordIpa',item.ipa||item.d&&item.d.ipa||'');
    var d=item.d||wordFromBank(item.en,item.bankId)||{};
    setText('wbWordCn',(d.pos?d.pos+' ':'')+(item.cn||d.cn||''));
    var example=item.eg||d.eg||'';
    setText('wbWordExample',example);$('wbWordExample').hidden=!example;$('wbWordTranslation').hidden=true;
    $('wbWordRemove').hidden=!item.wrong;$('wbWordAgain').textContent=item.wrong?'再背一次 →':'练这个词 →';
    if(!d.en && item.bankId!=='custom'){
      try{obBankReady(item.bankId).then(function(){if(activeWord===item){item.d=wordFromBank(item.en,item.bankId)||item.d;openWord(item);}}).catch(function(){});}catch(e){}
    }
    $('wbWordDialog').hidden=false;
  }
  function closeWord(){$('wbWordDialog').hidden=true;}
  function removeWrong(item){
    if(!item)return;
    try{wbForgetWrongIn(item.bankId,item.en);}catch(e){}
    closeWord();renderWrong();renderNav();
  }
  function renderBooks(){
    if(!selectedBook)selectedBook=active();
    var list=$('wbBookList');if(!list)return;
    list.innerHTML=books().map(function(b){return '<button class="wv-book-row'+(b.id===selectedBook?' on':'')+'" type="button" data-wb-book="'+esc(b.id)+'">'+ic('book')+'<span>'+esc(b.nm)+'</span><span aria-hidden="true">›</span></button>';}).join('')+'<button class="wv-book-import" type="button" id="wbBooksImport">＋ 导入词书</button>';
    renderBookDetail();
  }
  function renderBookDetail(){
    var b=book(selectedBook), c=counts(b.id), m=META[b.id]||META.custom, pct=c.t?Math.round(c.m/c.t*100):0;
    setText('wbBookOverline',m.overline);setText('wbBookIndex',m.index);setText('wbBookSource',m.source);setText('wbBookDesc',m.desc);setText('wbBookPriority','重要程度 · '+m.priority);
    setText('wbBookLabel',b.id===active()?'当前词书':'词书');setText('wbBookName',b.nm);setText('wbBookTotal',c.t.toLocaleString('en-US'));
    setText('wbBookM',c.m);setText('wbBookL',c.l);setText('wbBookN',c.n);
    var bar=$('wbBookTrack');if(bar)bar.style.width=pct+'%';
    var go=$('wbBookStart');if(go)go.textContent=b.id===active()?'继续背词':'背这本';
    if(b.id!=='custom'&&!wbLoaded(b.id)){try{obBankReady(b.id).then(function(){if(selectedBook===b.id)renderBookDetail();}).catch(function(){});}catch(e){}}
  }
  function dayWords(key){
    var n=num((DATA.wordDayStats||{})[key]&&DATA.wordDayStats[key].totalWords);
    try{Object.keys(window.__OB.banks||{}).forEach(function(id){var d=(window.__OB.banks[id].dayStats||{})[key];if(d)n+=num(d.totalWords);});}catch(e){}
    return n;
  }
  var statSeq = 0, statTries = 0;
  function paintStat(){
    var range=$('wbStatRange');if(range)range.innerHTML=[7,30].map(function(n){return '<button type="button" class="'+(n===statRange?'on':'')+'" data-wb-range="'+n+'">最近 '+n+' 天</button>';}).join('');
    var today=typeof todayKey==='function'?todayKey():'', days=[], sum=0, max=1;
    for(var i=statRange-1;i>=0;i--){var key=addDays(today,-i),n=dayWords(key);sum+=n;if(n>max)max=n;days.push({key:key,n:n});}
    setText('wbStatTotal',sum);setText('wbStatAverage','近 '+statRange+' 天 · 日均 '+Math.round(sum/statRange)+' 词');
    $('wbStatBars').innerHTML=days.map(function(d,index){var h=d.n?Math.max(7,Math.round(d.n/max*100)):0;return '<div class="wv-stat-bar'+(index===days.length-1?' today':'')+'" title="'+d.key+' · '+d.n+' 词"><em>'+(d.n||'')+'</em><i style="height:'+h+'%"></i><span>'+(index===days.length-1?'今天':(statRange===7||index%5===0?d.key.slice(5):''))+'</span></div>';}).join('');
    /* 环图口径 = 全部词书合计，和下方「每本进度」是同一张总账；
       只算当前词书会让人误以为换书后掌握量清零。 */
    var c={m:0,l:0,n:0,t:0};
    books().forEach(function(b){var bc=counts(b.id);c.m+=bc.m;c.l+=bc.l;c.n+=bc.n;c.t+=bc.t;});
    var pct=c.t?Math.round(c.m/c.t*100):0, circle=Math.round(283*pct/100);
    setText('wbStatPct',pct+'%');setText('wbStatM',c.m);setText('wbStatL',c.l);setText('wbStatN',c.n);
    $('wbStatRing').style.strokeDasharray=circle+' 283';
    $('wbStatProg').innerHTML=books().map(function(b){var bc=counts(b.id),p=bc.t?Math.round(bc.m/bc.t*100):0;return '<div class="wv-stat-prow"><span>'+esc(b.nm)+'</span><i><b style="width:'+p+'%"></b></i><span>'+p+'%</span></div>';}).join('');
  }
  function renderStat(){
    var seq = ++statSeq;
    statTries = 0;
    paintStat();
    /* 官方词库是按需加载的：先画一帧现有值，等 7 本都就绪后重画，
       否则「各词书进度」会整排 0%，环图也只算得到当前这本。 */
    loadStatBanks(seq);
  }
  function loadStatBanks(seq){
    var list = books();
    if(!list.length){
      /* 深链 #wb=data 会早于 __WM_BOOKS 初始化，稍等再取一次，最多约 3 秒。 */
      if(statTries++ < 20) setTimeout(function(){ if(seq === statSeq) loadStatBanks(seq); }, 250);
      return;
    }
    if(typeof obBankReady !== 'function') return;
    Promise.all(list.map(function(b){
      if(b.id === 'custom') return Promise.resolve();
      try{ return obBankReady(b.id).catch(function(){}); }catch(e){ return Promise.resolve(); }
    })).then(function(){ if(seq === statSeq) paintStat(); }).catch(function(){});
  }
  function openSettings(){renderSettings();$('wbSetDialog').hidden=false;}
  function renderSettings(){
    var c=cfg();setText('wbCapN',num(c.dailyCap)||'不限');
    ['wbSwAuto','wbSwFx','wbSwIpa'].forEach(function(id){var map={wbSwAuto:'autoPlay',wbSwFx:'fxFeedback',wbSwIpa:'showIpa'},el=$(id);if(el){el.classList.toggle('on',!!c[map[id]]);el.setAttribute('aria-checked',c[map[id]]?'true':'false');}});
    var ratio=$('wbRatio');if(ratio)Array.prototype.forEach.call(ratio.children,function(b){b.classList.toggle('on',b.getAttribute('data-ratio')===(c.newReviewRatio||'5:5'));});
  }
  function importBook(){show('home');var b=$('wmDealAdd');if(b)b.click();}
  function onClick(e){
    var t=e.target;if(!t||!t.closest)return;
    var tab=t.closest('[data-wb-tab]');if(tab){e.preventDefault();show(tab.getAttribute('data-wb-tab'));return;}
    if(t.closest('[data-wb-settings]')){e.preventDefault();openSettings();return;}
    if(t.closest('[data-wb-set-close]')){$('wbSetDialog').hidden=true;return;}
    var mode=t.closest('[data-wb-mode]');if(mode){try{pcSave({questionMode:mode.getAttribute('data-wb-mode')});}catch(e){}renderStudy();return;}
    var bk=t.closest('[data-wb-book]');if(bk){selectedBook=bk.getAttribute('data-wb-book');renderBooks();return;}
    if(t.closest('#wbBookStart')){try{wbSetActive(selectedBook);}catch(e){}show('study');return;}
    if(t.closest('#wbBooksImport')||t.closest('#wbSetManage')){importBook();return;}
    var review=t.closest('[data-wb-review]');if(review){openWord(wrongData()[Number(review.getAttribute('data-wb-review'))]);return;}
    var remove=t.closest('[data-wb-remove]');if(remove){removeWrong(wrongData()[Number(remove.getAttribute('data-wb-remove'))]);return;}
    var say=t.closest('[data-wb-say]');if(say){try{speakN(say.getAttribute('data-wb-say'));}catch(e){}return;}
    if(t.closest('#wbWordClose')){closeWord();return;}
    if(t.closest('#wbWordSound')){if(activeWord)try{speakN(activeWord.en);}catch(e){}return;}
    if(t.closest('#wbWordRemove')){removeWrong(activeWord);return;}
    if(t.closest('#wbPreviewCard')){openWord(activeWord);return;}
    if(t.closest('#wbWordAgain')){
      closeWord();
      practiceWords(activeWord?[activeWord]:[]);
      return;
    }
    if(t.closest('#wbWrongReview')){practiceWords(wrongData().filter(function(x){return !!x.w;}));return;}
    if(t.closest('#wbWrongGoStudy')){show('study');return;}
    var range=t.closest('[data-wb-range]');if(range){statRange=Number(range.getAttribute('data-wb-range'));renderStat();return;}
    if(t.closest('#wbCapMinus')||t.closest('#wbCapPlus')){var delta=t.closest('#wbCapPlus')?5:-5;try{pcSave({dailyCap:Math.max(0,num(cfg().dailyCap)+delta)});}catch(e){}renderSettings();try{if(window.__wdRefreshToday)window.__wdRefreshToday();}catch(e){}return;}
    var sw=t.closest('[data-wb-sw]');if(sw){var key=sw.getAttribute('data-wb-sw'),obj={};obj[key]=!cfg()[key];try{pcSave(obj);}catch(e){}renderSettings();return;}
    var ratio=t.closest('#wbRatio [data-ratio]');if(ratio){try{pcSave({newReviewRatio:ratio.getAttribute('data-ratio')});}catch(e){}renderSettings();return;}
  }
  function practiceWords(items){
    if(!items.length)return;
    var bankId=items[0].bankId||active(), words=items.filter(function(x){return x.bankId===bankId;}).map(function(x){return {en:x.en};});
    try{if(bankId!==active())wbSetActive(bankId);}catch(e){}
    var begin=function(){show('study');if(words.length&&typeof startWrongReview==='function'){startWrongReview(words);switchWordTab('study');}};
    if(bankId!=='custom'){obBankReady(bankId).then(begin).catch(function(){});}else begin();
  }
  function bind(){
    if(window.__wbTabsClick)document.removeEventListener('click',window.__wbTabsClick);
    window.__wbTabsClick=onClick;document.addEventListener('click',onClick);
    if(window.__wbTabsKey)document.removeEventListener('keydown',window.__wbTabsKey);
    window.__wbTabsKey=function(e){if(e.key==='Escape'){closeWord();$('wbSetDialog').hidden=true;}};document.addEventListener('keydown',window.__wbTabsKey);
    if(window.__wbTabsMerge)document.removeEventListener('hub:data-merged',window.__wbTabsMerge);
    window.__wbTabsMerge=function(){renderNav();var id=window.__wbCur;if(id==='wrong')renderWrong();if(id==='data')renderStat();if(id==='books')renderBooks();if(id==='study')renderStudy();};document.addEventListener('hub:data-merged',window.__wbTabsMerge);
    if(window.__wbTabsSwitch)document.removeEventListener('wb:switched',window.__wbTabsSwitch);
    window.__wbTabsSwitch=function(){selectedBook=active();if(window.__wbCur==='books')renderBooks();if(window.__wbCur==='study')renderStudy();};document.addEventListener('wb:switched',window.__wbTabsSwitch);
    if(window.__wbTabsHash)window.removeEventListener('hashchange',window.__wbTabsHash);
    window.__wbTabsHash=function(){var id=hashTab();if(id&&id!==window.__wbCur)show(id,{silent:true});};window.addEventListener('hashchange',window.__wbTabsHash);
  }
  window.__wbTabs={show:show,renderNav:renderNav,wrongData:wrongData,renderWrong:renderWrong,renderBooks:renderBooks,renderStat:renderStat,cur:function(){return window.__wbCur||'study';}};
  bind();show(hashId(),{silent:true});
})();
