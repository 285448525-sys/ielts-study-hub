/* RV-REBUILD-FULL-1：回顾页唯一展示与数据读取层。写入仍走 scores.js 等既有模块。 */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var SUBS=[{k:'listening',n:'听力',nid:'rvxNumL',sid:'rvxSubL'},{k:'reading',n:'阅读',nid:'rvxNumR',sid:'rvxSubR'},{k:'writing',n:'写作',nid:'rvxNumW',sid:'rvxSubW'},{k:'speaking',n:'口语',nid:'rvxNumS',sid:'rvxSubS'}];
var pick='overall',statRange='recent',saveCounts={whole:null,part:null},submitting=false;
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):null}
function scores(){return Array.isArray(DATA.scores)?DATA.scores.slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))}):[]}
function targets(){return DATA.settings&&DATA.settings.targets||{}}
function targetText(v){var n=Number(v);return n%1?one(n):String(n)}
function gap(v,t){var g=Number(t);if(!g)return '目标未设';var d=Math.round((g-Number(v))*2)/2;if(d<=0)return '目标 '+targetText(g)+' · 已达标';return '目标 '+targetText(g)+' · 差 '+one(d)}
function duration(sec){sec=Math.max(0,Number(sec)||0);if(sec>=3600)return (Math.round(sec/360)/10).toFixed(1)+' 小时';return Math.round(sec/60)+' 分钟'}
function durationShort(sec){sec=Math.max(0,Number(sec)||0);if(sec>=3600)return (Math.round(sec/360)/10).toFixed(1)+'h';return Math.round(sec/60)+'m'}
function summary(){
 var list=scores(),last=list[list.length-1],t=targets();
 if(!list.length){$('rv2Summary').innerHTML='<div class="rv2-empty"><h2>还没有真题成绩</h2><p>先录入一次，开始看见自己的进步。不用补齐历史，从最近一次开始就可以。</p><button class="rv2-primary" data-rv2-add>录入成绩</button></div>'}else if(!$('rvxNumAll')){$('rv2Summary').innerHTML='<div class="rv2-latest"><div><div class="rv2-muted" id="rvxLeadLab"></div><div class="rv2-score"><span id="rvxNumAll">—</span><small> / 9</small></div></div><div class="rv2-target" id="rvxSubAll"></div></div><div class="rv2-subjects">'+SUBS.map(function(s){var k=s.k.charAt(0).toUpperCase();return '<div class="rv2-subject" id="rvxCell'+k+'"><span>'+s.n+'</span><b id="rvxNum'+k+'">—</b><small id="rvxSub'+k+'">—</small></div>'}).join('')+'</div>'}
 if(last)$('rvxLeadLab').textContent='最近一次 · '+Number(String(last.date).slice(5,7))+'月'+Number(String(last.date).slice(8,10))+'日';
 var all=last?overall(last.listening,last.reading,last.writing,last.speaking):null;if(last){$('rvxNumAll').textContent=one(all);$('rvxSubAll').textContent=gap(all,t.overall)}
 if(!last)return;
 SUBS.forEach(function(s){var cell=$({listening:'rvxCellL',reading:'rvxCellR',writing:'rvxCellW',speaking:'rvxCellS'}[s.k]);var v=last&&last[s.k]!=null?Number(last[s.k]):null;$(s.nid).textContent=v==null?'—':one(v);$(s.sid).textContent=v==null?'—':gap(v,t[s.k]);cell.classList.remove('rvx-weak','rvx-ok');if(v!=null&&Number(t[s.k]))cell.classList.add(Number(v)>=Number(t[s.k])?'rvx-ok':'rvx-weak')});
 if(!list.length){$('rv2Summary').innerHTML='<div class="rv2-empty"><h2>还没有真题成绩</h2><p>先录入一次，开始看见自己的进步。不用补齐历史，从最近一次开始就可以。</p><button class="rv2-primary" data-rv2-add>录入成绩</button></div>';return}
 $('rvxRecN').textContent=list.length;
 var cd=typeof examCountdown==='function'?examCountdown():null;
 if(cd&&cd.hasExam&&cd.daysLeft>0){$('rvxCdVal').textContent=cd.daysLeft+' 天';$('rvxCdLab').textContent='距 '+cd.md}else if(cd&&cd.hasExam){$('rvxCdVal').textContent='已到考试日';$('rvxCdLab').textContent=cd.md+' · 不再显示倒计时'}else{$('rvxCdVal').textContent='未设置';$('rvxCdLab').textContent='考试日期'}
 var hasTargets=SUBS.some(function(s){return Number(t[s.k])>0})||Number(t.overall)>0;
 var worst=null,worstGap=0;if(last)SUBS.forEach(function(s){var d=Math.round((Number(t[s.k])-Number(last[s.k]))*2)/2;if(Number(t[s.k])&&d>worstGap){worstGap=d;worst=s}});
 if(!hasTargets){$('rvxWeak').textContent='先设一个目标分';$('rv2WeakText').textContent='填好四科目标后，这里会告诉你最值得先补哪一科。';$('rvxWeakGo').textContent='去设置目标';$('rvxWeakGo').dataset.subject='settings'}
 else{$('rvxWeak').textContent=worst?worst.n+' '+one(last[worst.k]):'四科均已达标';$('rv2WeakText').textContent=worst?'距离 '+targetText(t[worst.k])+' 的目标还差 '+one(worstGap)+'。先稳住这一科，再做整套练习。':'当前没有未达标科目，按自己的节奏继续。';$('rvxWeakGo').textContent=worst?'去练'+worst.n:'去练习';$('rvxWeakGo').dataset.subject=worst?worst.k:''}
 var first=list[0],lastAll=last?overall(last.listening,last.reading,last.writing,last.speaking):null,firstAll=first?overall(first.listening,first.reading,first.writing,first.speaking):null,diff=list.length>1&&lastAll!=null&&firstAll!=null?Math.round((lastAll-firstAll)*2)/2:null;
 $('rv2ProgressNote').textContent=list.length===1?'已记下第一条成绩，下一次再来就能看见变化。':(diff==null?'真实数据只来自你的学习记录。':(diff>0?'相比首次记录，总分提高 '+one(diff)+'。':diff<0?'相比首次记录，总分变化 '+one(diff)+'。':'与首次记录相比，总分保持稳定。'));
}
function trendPoints(){
 var per={},seen={};SUBS.forEach(function(s){per[s.k]={}});
 function put(k,d,v,real){d=String(d||'').slice(0,10);v=Number(v);if(!per[k]||!d||!isFinite(v)||v<=0||v>9)return;per[k][d]={date:d,v:v,real:!!real};seen[d]=true}
 scores().forEach(function(r){SUBS.forEach(function(s){put(s.k,r.date,r[s.k],true)})});
 (Array.isArray(DATA.mockRecords)?DATA.mockRecords:[]).forEach(function(r){if(!r)return;if(r.kind==='speaking'||(!Array.isArray(r.parts)&&r.p1)){put('speaking',r.date,r.overall,false);return}if(!Array.isArray(r.parts)||!per[r.type])return;var cfg=typeof MOCK_TYPES!=='undefined'&&MOCK_TYPES[r.type];if(!cfg)return;var v=null;if(cfg.mode==='score'){var sum=0,w=0;r.parts.forEach(function(p){if(typeof p.score==='number'){var weight=typeof p.weight==='number'?p.weight:1;sum+=p.score*weight;w+=weight}});if(w)v=sum/w}else{var c=0,t=0;r.parts.forEach(function(p){c+=Number(p.correct)||0;t+=Number(p.total)||0});if(typeof r.overall==='number')v=r.overall;else if(t&&typeof estimateBand==='function')v=estimateBand(r.type,c,t)}put(r.type,r.date,v,false)});
 return{dates:Object.keys(seen).sort(),per:per}
}
function trend(){
 var got=trendPoints(),dates=got.dates,per=got.per,cells={},color='var(--primary)',name='总分';
 if(pick==='overall'){dates.forEach(function(d){var vals=SUBS.map(function(s){return per[s.k][d]}).filter(Boolean);if(vals.length>=2)cells[d]={v:vals.reduce(function(a,x){return a+x.v},0)/vals.length,real:vals.some(function(x){return x.real})}})}else{cells=per[pick];SUBS.forEach(function(s){if(s.k===pick)name=s.n})}
 if(!dates.length){$('rv2TrendCanvas').innerHTML='<div class="rv2-chart-empty">有两次以上成绩后，这里会出现趋势。<br>真题、模考和手动录入都会计入。</div>';$('rvxTrendLab').textContent='录入成绩后开始记录变化';$('rv2RangeText').textContent='暂无成绩记录';$('rv2GoalText').textContent='';return}
 var idx=dates.map(function(d,i){return cells[d]?i:-1}).filter(function(i){return i>=0});if(!idx.length){$('rv2TrendCanvas').innerHTML='<div class="rv2-chart-empty">这一科还没有可画的成绩记录。</div>';$('rvxTrendLab').textContent=name+' · 暂无记录';return}
 var W=640,H=218,left=40,right=12,top=12,bottom=28,pw=W-left-right,ph=H-top-bottom;
 var X=function(i){return dates.length===1?left+pw/2:left+pw*i/(dates.length-1)},Y=function(v){return top+ph*(1-Math.max(4,Math.min(9,v)-4)/5)};
 var s='';for(var g=4;g<=9;g++){var y=Y(g);s+='<line x1="'+left+'" y1="'+y+'" x2="'+(W-right)+'" y2="'+y+'" stroke="var(--line)"/><text x="5" y="'+(y+4)+'" fill="var(--muted)" font-size="11">'+g+'</text>'}
 var t=Number(targets()[pick]);if(t>=4&&t<=9){var gy=Y(t);s+='<line x1="'+left+'" y1="'+gy+'" x2="'+(W-right)+'" y2="'+gy+'" stroke="var(--warn)" stroke-dasharray="5 5" opacity=".65"/>';$('rv2GoalText').textContent='虚线 = 目标 '+targetText(t)}else $('rv2GoalText').textContent='';
 if(idx.length>1){var pts=idx.map(function(i){return X(i)+','+Y(cells[dates[i]].v)}).join(' ');s+='<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'}
 idx.forEach(function(i){var c=cells[dates[i]],x=X(i),y=Y(c.v);s+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="'+(c.real?color:'var(--surface)')+'" stroke="'+color+'" stroke-width="2"><title>'+dates[i]+'：'+one(c.v)+'</title></circle>'});
 var step=Math.max(1,Math.ceil(dates.length/5));dates.forEach(function(d,i){if(i%step&&i!==dates.length-1)return;var anchor=i===0?'start':(i===dates.length-1?'end':'middle');s+='<text x="'+X(i)+'" y="212" text-anchor="'+anchor+'" fill="var(--muted)" font-size="11">'+esc(d.slice(5))+'</text>'});
 $('rv2TrendCanvas').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+name+'成绩趋势">'+s+'</svg>';$('rvxTrendLab').textContent='近 '+idx.length+' 次'+name+'记录';$('rv2RangeText').textContent=dates[0].slice(5)+' — '+dates[dates.length-1].slice(5)
}
function records(){
 var all=typeof RecAll!=='undefined'&&RecAll.collect?RecAll.collect():[];var limit=$('recordFilter').value==='recent'?3:all.length;var list=all.slice(0,limit);
 if(!all.length){$('recAll').innerHTML='<div class="rv2-rec-empty">保存后会在这里看到每次成绩、分项练习与口语模考。</div>';return}
 $('recAll').innerHTML=list.map(function(r){return '<div class="rv2-rec-row" data-id="'+esc(r.id)+'" data-kind="'+esc(r.kind)+'"><span class="rv2-rec-date">'+esc(r.date)+'</span><div class="rv2-rec-main"><b>'+esc(r.title)+'</b><span>'+({whole:'整套真题',part:'分项练习',speaking:'口语模考'}[r.kind]||'学习记录')+'</span></div><span class="rv2-rec-score">'+esc(r.main)+'<small>'+esc(r.mainLabel)+'</small></span><button class="rv2-detail" data-rv2-detail="'+esc(r.id)+'" data-kind="'+esc(r.kind)+'">详情</button></div>'}).join('')+(all.length>list.length?'<div class="rv2-rec-empty">当前显示最近三次，右上角可切换全部记录。</div>':'')
}
function performance(){
 var cutoff=new Date();cutoff.setDate(cutoff.getDate()-29);var cut=statRange==='recent'?todayKey(cutoff):'';var recs=(Array.isArray(DATA.mockRecords)?DATA.mockRecords:[]).filter(function(r){return !cut||String(r.date||'')>=cut});
 var out=SUBS.map(function(s){var rows=recs.filter(function(r){return r&&(r.type===s.k||s.k==='speaking'&&(r.kind==='speaking'||(!Array.isArray(r.parts)&&r.p1)))});if(s.k==='listening'||s.k==='reading'){var c=0,t=0;rows.forEach(function(r){(r.parts||[]).forEach(function(p){c+=Number(p.correct)||0;t+=Number(p.total)||0})});var pct=t?Math.round(c/t*100):null;return '<div class="rv2-perf-item"><h3>'+s.n+'</h3><b>'+(pct==null?'暂无':pct+'%')+'</b>'+(pct==null?'':'<div class="rv2-bar"><i style="width:'+pct+'%"></i></div>')+'<p>'+rows.length+' 次练习 · '+(t?c+' / '+t+' 题':'完成练习后显示正确率')+'</p></div>'}
 var secs=rows.reduce(function(a,r){return a+(Number(r.usedSec)||Number(r.durationSec)||Number(r.duration)||0)},0);var label=s.k==='writing'?'写作练习':'口语模考';return '<div class="rv2-perf-item"><h3>'+s.n+'</h3><b>'+rows.length+' 次</b><p>'+label+' · '+(secs?'累计 '+duration(secs):'练习记录不重复显示分数')+'</p></div>'});
 if(!recs.length)$('rv2PerfGrid').innerHTML='<div class="rv2-rec-empty" style="grid-column:1/-1">这一时间段还没有分项练习。完成一次练习后，这里会显示正确率或练习量。</div>';else $('rv2PerfGrid').innerHTML=out.join('')
}
function bind(){
 if(document.documentElement.__rv2Bound)return;document.documentElement.__rv2Bound=true;
 document.addEventListener('click',function(ev){var el=ev.target&&ev.target.closest?ev.target:null;if(!el)return;
  var add=el.closest('[data-rv2-add]');if(add){ev.preventDefault();saveCounts={whole:scores().length,part:Array.isArray(DATA.mockRecords)?DATA.mockRecords.length:0};var d=$('rv2AddDialog');if(d&&!d.open)d.showModal();return}
  var kind=el.closest('.rv2-kind [data-kind]');if(kind){ev.preventDefault();document.querySelectorAll('.rv2-kind button').forEach(function(b){b.classList.toggle('active',b===kind)});$('scAddWrap').hidden=kind.dataset.kind!=='whole';$('mkAddWrap').hidden=kind.dataset.kind!=='part';return}
  var tr=el.closest('#rvxTrendChips [data-k]');if(tr){ev.preventDefault();pick=tr.dataset.k;document.querySelectorAll('#rvxTrendChips button').forEach(function(b){b.classList.toggle('active',b===tr)});trend();return}
  if(el.closest('#rvxWeakGo')){ev.preventDefault();var k=$('rvxWeakGo').dataset.subject;location.href=k==='settings'?'settings.html?pane=targets':k==='speaking'?'speaking.html':(k?'bank.html?ch='+k:'bank.html');return}
  var det=el.closest('[data-rv2-detail]');if(det){ev.preventDefault();openDetail(det.dataset.rv2Detail,det.dataset.kind);return}
  if(el.closest('[data-close-detail]')){$('rv2DetailDialog').close();return}
  var del=el.closest('#rv2DetailBody .rec-del');if(del){ev.preventDefault();var orig=document.querySelector('#rvLegacy '+(del.dataset.kind==='whole'?'#scoreList':del.dataset.kind==='part'?'#mkList':'#mockHistoryList')+' [data-del="'+del.dataset.id+'"],#rvLegacy #mockHistoryList [data-id="'+del.dataset.id+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var md=el.closest('#rv2DetailBody .plan-del[data-del]');if(md){ev.preventDefault();var orig=document.querySelector('#rvLegacy [data-del="'+md.dataset.del+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var mh=el.closest('#rv2DetailBody .mock-hist-del[data-id]');if(mh){ev.preventDefault();var orig=document.querySelector('#rvLegacy #mockHistoryList .mock-hist-del[data-id="'+mh.dataset.id+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var mt=el.closest('#rv2DetailBody .mock-hist-toggle[data-id]');if(mt){ev.preventDefault();var orig=document.querySelector('#rvLegacy #mockHistoryList .mock-hist-toggle[data-id="'+mt.dataset.id+'"]');if(orig){orig.click();var body=document.getElementById('mh-'+mt.dataset.id);if(body)body.hidden=orig.textContent.indexOf('展开')>=0;mt.textContent=orig.textContent}return}
  if(el.closest('#rv2DialogForm #addScore, #rv2DialogForm #mkAdd')){
   if(submitting)return;submitting=true;var saveButton=el.closest('#addScore, #mkAdd');saveButton.disabled=true;
   setTimeout(function(){var isWhole=saveButton.id==='addScore',n=isWhole?scores().length:DATA.mockRecords.length,key=isWhole?'whole':'part';if(saveCounts[key]!==null&&n>saveCounts[key]){var d=$('rv2AddDialog');if(d.open)d.close()}saveButton.disabled=false;submitting=false;paint()},50)
  }
 });
 document.addEventListener('change',function(ev){if(ev.target===$('recordFilter'))records();if(ev.target===$('rv2StatRange')){statRange=ev.target.value;performance()}});
 document.addEventListener('hub:data-merged',function(){setTimeout(paint,50)});
}
function openDetail(id,kind){var body=$('rv2DetailBody'),src=kind==='whole'?$('scoreList'):kind==='part'?$('mkList'):$('mockHistoryList');body.innerHTML='';if(src)Array.prototype.forEach.call(src.children,function(node){if(kind==='whole'&&!node.querySelector('[data-del="'+id+'"]'))return;if(kind==='part'&&!node.querySelector('[data-del="'+id+'"]'))return;if(kind==='speaking'&&node.dataset.id!==String(id))return;body.appendChild(node.cloneNode(true))});if(kind==='whole'){var t=targets(),has=Number(t.overall)>0;body.querySelectorAll('.badge.up,.badge.down').forEach(function(b){if(!has){b.textContent='目标未设';b.classList.remove('up','down')}})}if(!body.children.length)body.innerHTML='<p>这条记录的原始明细暂未加载，请稍后再看。</p>';var d=$('rv2DetailDialog');if(!d.open)d.showModal()}
function paint(){if(typeof DATA==='undefined'||!DATA)return;summary();trend();records();performance()}
function boot(){bind();paint();window.hubRepaintReviewE=paint}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
