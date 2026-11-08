/* RV-REBUILD-FULL-1：回顾页唯一展示与数据读取层。写入仍走 scores.js 等既有模块。 */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var SUBS=[{k:'listening',n:'听力',nid:'rvxNumL',sid:'rvxSubL'},{k:'reading',n:'阅读',nid:'rvxNumR',sid:'rvxSubR'},{k:'writing',n:'写作',nid:'rvxNumW',sid:'rvxSubW'},{k:'speaking',n:'口语',nid:'rvxNumS',sid:'rvxSubS'}];
var pick='overall',statRange='recent',saveCounts={whole:null,part:null},submitting=false;
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function cssq(s){return window.CSS&&CSS.escape?CSS.escape(String(s)):String(s).replace(/["\\]/g,'\\$&')}
function one(v){var n=Number(v);return isFinite(n)?(Math.round(n*2)/2).toFixed(1):null}
function scores(){return Array.isArray(DATA.scores)?DATA.scores.slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))}):[]}
function targets(){return DATA.settings&&DATA.settings.targets||{}}
function targetText(v){var n=Number(v);return n%1?one(n):String(n)}
function gap(v,t){var g=Number(t);if(!g)return '目标未设';var d=Math.round((g-Number(v))*2)/2;if(d<=0)return '目标 '+targetText(g)+' · 已达标';return '目标 '+targetText(g)+' · 差 '+one(d)}
function duration(sec){sec=Math.max(0,Number(sec)||0);if(sec>=3600)return (Math.round(sec/360)/10).toFixed(1)+' 小时';return Math.round(sec/60)+' 分钟'}
function durationShort(sec){sec=Math.max(0,Number(sec)||0);if(sec>=3600)return (Math.round(sec/360)/10).toFixed(1)+'h';return Math.round(sec/60)+'m'}
function summary(){
 var list=scores(),last=list[list.length-1],t=targets();
 if(!list.length){$('rv2Summary').innerHTML=window.RVE.hero({title:'还没有成绩记录',desc:'录入一次真题或模考分数，这里就会慢慢长出成绩趋势、四科强弱和学习天数。不用补齐历史，从最近一次开始就行。',btn:'录入成绩',pills:['成绩趋势','四科表现','学习投入']})}else if(!$('rvxNumAll')){$('rv2Summary').innerHTML='<div class="rv2-latest"><div><div class="rv2-muted" id="rvxLeadLab"></div><div class="rv2-score"><span id="rvxNumAll">—</span><small> / 9</small></div></div><div class="rv2-target" id="rvxSubAll"></div></div><div class="rv2-subjects">'+SUBS.map(function(s){var k=s.k.charAt(0).toUpperCase();return '<div class="rv2-subject" id="rvxCell'+k+'"><span>'+s.n+'</span><b id="rvxNum'+k+'">—</b><small id="rvxSub'+k+'">—</small></div>'}).join('')+'</div>'}
 if(last)$('rvxLeadLab').textContent='最近一次 · '+Number(String(last.date).slice(5,7))+'月'+Number(String(last.date).slice(8,10))+'日';
 var all=last?overall(last.listening,last.reading,last.writing,last.speaking):null;if(last){$('rvxNumAll').textContent=one(all);$('rvxSubAll').textContent=gap(all,t.overall)}
 if(!last)return;
 SUBS.forEach(function(s){var cell=$({listening:'rvxCellL',reading:'rvxCellR',writing:'rvxCellW',speaking:'rvxCellS'}[s.k]);var v=last&&last[s.k]!=null?Number(last[s.k]):null;$(s.nid).textContent=v==null?'—':one(v);$(s.sid).textContent=v==null?'—':gap(v,t[s.k]);cell.classList.remove('rvx-weak','rvx-ok');if(v!=null&&Number(t[s.k]))cell.classList.add(Number(v)>=Number(t[s.k])?'rvx-ok':'rvx-weak')});
 if(!list.length){$('rv2Summary').innerHTML=window.RVE.hero({title:'还没有成绩记录',desc:'录入一次真题或模考分数，这里就会慢慢长出成绩趋势、四科强弱和学习天数。不用补齐历史，从最近一次开始就行。',btn:'录入成绩',pills:['成绩趋势','四科表现','学习投入']});return}
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
/* TREND-AXIS-1：视图状态（按分数/按对题个数）。挂 window 加守卫——软导航重跑脚本时
   顶层 var 会重置，但 window 上的值保留，切到个数视角后软导航回来不掉回分数（R4）。 */
var view=(window.__rvxTrendView==='count'?'count':'score');
window.__rvxTrendView=view;
/* 对题数数据源：只有听/读模考记录的 parts[].correct/total 有真值；真题录入只有 band 分（R1）。
   按日期聚合成 {date,c,t}，c=null 表示该日没有对题数（折线做 gap 处理）。 */
function countPoints(){
 var per={listening:{},reading:{}};
 (Array.isArray(DATA.mockRecords)?DATA.mockRecords:[]).forEach(function(r){
  if(!r||!Array.isArray(r.parts)||!per[r.type])return;
  /* R2：整卷模考（gran=whole）的 parts 是整套 40 题，不是单科片段——个数视角只看分项模考记录 */
  if(r.gran==='whole')return;
  var c=0,t=0;r.parts.forEach(function(p){c+=Number(p.correct)||0;t+=Number(p.total)||0});
  if(!t)return;
  var d=String(r.date||'').slice(0,10);if(!d)return;
  /* 同一天多次练习：累加对题数与总题数（与表现统计的聚合口径一致） */
  if(!per[r.type][d])per[r.type][d]={date:d,c:0,t:0};
  per[r.type][d].c+=c;per[r.type][d].t+=t;
 });
 return per;
}
/* R6：目标分→目标对题数。用记录里的实际 total（max，整套模考总数），不硬编码 40。
   反算 = 目标 band 在 BAND_TABLE 里对应的最低对题比例 × 实际 total。 */
function goalCountFor(type){
 var t=Number(targets()[type]);if(!(t>0))return null;
 var tbl=typeof BAND_TABLE!=='undefined'&&BAND_TABLE[type];if(!tbl)return null;
 var minRatio=null;
 for(var i=0;i<tbl.length;i++){if(tbl[i][1]===t){minRatio=tbl[i][0]/40;break}}
 if(minRatio==null)return null;
 /* total 取该科对题数记录里的最大值（最接近整套模考的真实题量） */
 var cp=countPoints()[type]||{},maxT=0;
 Object.keys(cp).forEach(function(d){if(cp[d].t>maxT)maxT=cp[d].t});
 if(!maxT)return null;
 return Math.round(minRatio*maxT);
}
function trend(){
 var isCount=(view==='count');
 var applicable=!isCount||(pick==='listening'||pick==='reading');
 var color='var(--primary)',name='总分';SUBS.forEach(function(s){if(s.k===pick)name=s.n});
 /* 个数视角不适用（写作/口语/总分）→ 出解释文案，不出假图 */
 if(!applicable){
  $('rv2TrendCanvas').innerHTML=window.RVE.inline({ic:'line',title:'这个视角不适用',desc:'对题个数只对听力和阅读才有意义。写作、口语、总分没有「对几题」的概念，请切回「按分数」。',roomy:true});
  $('rvxTrendLab').textContent='按对题个数 · 此视角不适用';$('rv2RangeText').textContent='';$('rv2GoalText').textContent='';return;
 }
 var dates,cells;
 if(isCount){
  var cp=countPoints()[pick]||{};
  dates=Object.keys(cp).sort();
  cells={};dates.forEach(function(d){cells[d]={v:cp[d].c,total:cp[d].t,real:false}});
 }else{
  var got=trendPoints();dates=got.dates;var per=got.per;cells={};
  if(pick==='overall'){dates.forEach(function(d){var vals=SUBS.map(function(s){return per[s.k][d]}).filter(Boolean);if(vals.length>=2)cells[d]={v:vals.reduce(function(a,x){return a+x.v},0)/vals.length,real:vals.some(function(x){return x.real})}})}else{cells=per[pick]}
 }
 if(!dates.length){
  $('rv2TrendCanvas').innerHTML=window.RVE.inline({ic:'line',title:'两次成绩后就会出现趋势',desc:'真题、模考和手动录入都会计入，按日期连成一条线。',foot:'已记录 0 次',roomy:true});
  $('rvxTrendLab').textContent='录入成绩后开始记录变化';$('rv2RangeText').textContent='暂无成绩记录';$('rv2GoalText').textContent='';return;
 }
 var idx=dates.map(function(d,i){return cells[d]?i:-1}).filter(function(i){return i>=0});
 if(!idx.length){
  $('rv2TrendCanvas').innerHTML=window.RVE.inline({ic:'line',title:'这一科还没有可画的记录',desc:isCount?'这一科还没有可画的对题数记录。':'这一科还没有可画的成绩记录。',roomy:true});
  $('rvxTrendLab').textContent=name+' · 暂无记录';return;
 }
 /* 纵轴自适应（替换原固定 4-9 档）：数据 min-max + 目标值纳入 + 上下留白。
    分数视角 tick 压回 0.5 档（R5），个数视角取整。 */
 var vals=idx.map(function(i){return cells[dates[i]].v});
 var goalV=isCount?goalCountFor(pick):Number(targets()[pick]);
 var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
 if(goalV!=null&&isFinite(goalV)&&goalV>0){lo=Math.min(lo,goalV);hi=Math.max(hi,goalV)}
 var pad=isCount?Math.max(2,Math.round((hi-lo)*0.15)):0.5;
 lo=Math.max(0,lo-pad);hi=hi+pad;
 if(isCount){lo=Math.floor(lo);hi=Math.ceil(hi)}
 var steps=4,span=hi-lo,tick=[];steps=(span/(isCount?5:1))>4?4:3;
 for(var gi=0;gi<=steps;gi++){var gv=lo+span*gi/steps;tick.push(isCount?Math.round(gv):Math.round(gv*2)/2)}
 var W=640,H=230,left=44,right=14,top=14,bottom=30,pw=W-left-right,ph=H-top-bottom;
 var X=function(i){return dates.length===1?left+pw/2:left+pw*i/(dates.length-1)};
 var Y=function(v){return top+ph*(1-(v-lo)/(hi-lo))};
 var s='';tick.forEach(function(v){var y=Y(v);s+='<line x1="'+left+'" y1="'+y+'" x2="'+(W-right)+'" y2="'+y+'" stroke="var(--line)"/><text x="6" y="'+(y+4)+'" fill="var(--muted)" font-size="12">'+v+(isCount?' 题':'')+'</text>'});
 if(goalV!=null&&isFinite(goalV)&&goalV>0){
  var gy=Y(goalV);s+='<line x1="'+left+'" y1="'+gy+'" x2="'+(W-right)+'" y2="'+gy+'" stroke="var(--warn)" stroke-dasharray="5 5" opacity=".65"/>';
  $('rv2GoalText').textContent=isCount?('虚线 = 目标 '+goalV+' 题（由目标分 '+targetText(Number(targets()[pick]))+' 换算）'):('虚线 = 目标 '+targetText(goalV));
 }else $('rv2GoalText').textContent='';
 /* R1：折线分段——对题数视角下没有对题数的日期不画点，折线在空点处断开（gap），不穿空点 */
 if(idx.length>1){
  var segs=[],cur=[];
  idx.forEach(function(i){var v=cells[dates[i]].v;if(v==null||!isFinite(v)){if(cur.length)segs.push(cur);cur=[];return}cur.push(X(i)+','+Y(v))});
  if(cur.length)segs.push(cur);
  segs.forEach(function(seg){if(seg.length>1)s+='<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'});
 }
 idx.forEach(function(i){var c=cells[dates[i]];if(c.v==null||!isFinite(c.v))return;var x=X(i),y=Y(c.v);
  s+='<circle cx="'+x+'" cy="'+y+'" r="4.5" fill="'+(c.real?color:'var(--surface)')+'" stroke="'+color+'" stroke-width="2"><title>'+dates[i]+'：'+(isCount?c.v+' / '+c.total+' 题':one(c.v)+' 分')+'</title></circle>'});
 var step=Math.max(1,Math.ceil(dates.length/5));dates.forEach(function(d,i){if(i%step&&i!==dates.length-1)return;var anchor=i===0?'start':(i===dates.length-1?'end':'middle');s+='<text x="'+X(i)+'" y="'+(H-6)+'" text-anchor="'+anchor+'" fill="var(--muted)" font-size="12">'+esc(d.slice(5))+'</text>'});
 $('rv2TrendCanvas').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+name+'成绩趋势">'+s+'</svg>';
 $('rvxTrendLab').textContent='近 '+idx.length+' 次'+name+(isCount?' · 对题个数':' 记录');
 $('rv2RangeText').textContent=dates[0].slice(5)+' — '+dates[dates.length-1].slice(5);
}
/* RV-RECALL-KEEP-1（11-01）：整页重建时 rec-all.js 的 render() 被一行早退挡掉
   （`if(document.getElementById('reviewMain'))return`），连带丢了它给整卷行挂的
   「看上次结果 / 重新做一遍」两个按钮，以及 ?rec=<id> 定位。rec-all.js:230 的注释
   写得很清楚「老记录没 ids → 按钮照样显示，不点了先 confirm 说明降级；不藏按钮、
   不静默随机（B 明令）」—— 重建把这条明令一并抹掉了，是回归不是取舍。
   修法 = 新结构自己把这套挂回来，逻辑与 rec-all.js 完全同源（不重写、不新建存储）：
     · 只给「整卷 + src:bank」的行挂两个按钮（单篇走原有「再做一次」那条路，不重复给）
     · 看上次结果 → review.html?rec=<id>（本页软导航同页重跑脚本读 ?rec=）
     · 重新做一遍 → window.__hubOpenFullTestFromIds(ids)（与点 Start 同一条路径）
     · 老记录没 ids → 按钮照样显示，点了先 confirm 说明降级（不藏、不静默随机） */
function recActs(r){
 if(!r||r.gran!=='whole'||r.src!=='bank')return '';
 return '<span class="rv2-rec-acts"><button type="button" class="rv2-rec-last" data-rec-last="'+esc(r.id)+'">看上次结果</button>'
  +'<button type="button" class="rv2-rec-again" data-rec-again="'+esc(r.id)+'">重新做一遍</button></span>';
}
/* RV-REC-CHIP-1（11-01，B2 过闸条件）：把类型筛选补回来。
   旧 rec-all.js 用 #recAllChips 三个 chip 做「时间 × 类型」二维筛选，重建时
   chips 被 hidden、只剩 recordFilter 的时间维度 —— 筛选能力从 2D 降成 1D，
   用户没法只看某一类。B2 独立判定为功能丢失，不是设计取舍。
   做法（最小改、DOM 已在、不建新模块）：
     · 单选 chip：全部 / 整卷 / 分项 / 口语模考，与 recordFilter 的 recent/all 做 AND
     · chip 文案带计数（沿用旧 chips 的「整卷 5」口径，信息没丢）
     · chip 状态存 window.__rv2Chip，与既有 pick/statRange 同级的做法一致
   与旧版的差异（有意为之）：旧版是三键各自 toggle（要看整卷得先点掉分项和口语），
   现在改单选 + 「全部」，同样能只看一类，点得更少。 */
/* ⚠️ 分类口径（重要，别只看 kind）：rec-all.js 的 collect() 有个历史包袱 ——
   整卷模考记录的 kind 恒为 'part'（注释见 rec-all.js:74「整卷记录也被标成分项…
   kind 保持 part 不动 —— 它同时被筛选 chip 与删除转发复用」），真正的粒度在 gran。
   所以筛选/计数**必须按语义粒度**：speaking 看 kind，whole/part 看 gran。
   只用 kind 的话，「阅读 · 整卷」那条会被归到「分项」里，而点「整卷」又看不到它 ——
   用户看到的标题与筛选结果自相矛盾。 */
function recCat(r){
 if(!r)return '';
 if(r.kind==='speaking')return 'speaking';
 if(r.kind==='whole')return 'whole';          /* DATA.scores 的真题录入行 */
 return r.gran==='whole'?'whole':'part';      /* mockRecords：整卷模考 gran=whole，kind 恒为 part（历史包袱） */
}
var CHIP_NAMES={all:'全部',whole:'整卷',part:'分项',speaking:'口语模考'};
function chipKey(){return (window.__rv2Chip||'all')}
function paintChips(all){
 var wrap=$('recAllChips');if(!wrap)return;
 var n={all:all.length,whole:0,part:0,speaking:0};
 all.forEach(function(r){var c=recCat(r);if(n[c]!=null)n[c]++});
 wrap.querySelectorAll('button[data-k]').forEach(function(b){
  var k=b.dataset.k;b.textContent=CHIP_NAMES[k]+' '+(n[k]==null?0:n[k]);
  b.classList.toggle('active',k===chipKey())
 })
}
function records(){
 var all=typeof RecAll!=='undefined'&&RecAll.collect?RecAll.collect():[];
 paintChips(all);
 /* 类型筛选（chip）→ 再套时间筛选（recordFilter），两维 AND。按 recCat 的语义粒度 */
 var k=chipKey();
 var pool=k==='all'?all:all.filter(function(r){return recCat(r)===k});
 var limit=$('recordFilter').value==='recent'?3:pool.length;var list=pool.slice(0,limit);
 window.__rv2RecList=all;   /* 供「重新做一遍」按 id 取回 ids/type，不二次读 DATA（同 id 可能被筛选/覆盖） */
 if(!all.length){$('recAll').innerHTML=window.RVE.inline({ic:'table',title:'还没有记录',desc:'整卷、分项、口语模考都会汇总到这里，按日期排。',foot:'录入一次成绩后，这里就会开始记录',roomy:true});return}
 if(!pool.length){$('recAll').innerHTML=window.RVE.inline({ic:'table',title:'这一栏还没有记录',desc:'换个类型或选「全部」看看。',roomy:true});return}
 $('recAll').innerHTML=list.map(function(r){var cat=recCat(r);return '<div class="rv2-rec-row" data-id="'+esc(r.id)+'" data-rec-id="'+esc(r.id)+'" data-kind="'+esc(r.kind)+'" data-cat="'+esc(cat)+'"'+(r.gran?' data-gran="'+esc(r.gran)+'"':'')+'><span class="rv2-rec-date">'+esc(r.date)+'</span><div class="rv2-rec-main"><b>'+esc(r.title)+'</b><span>'+({whole:'整套真题',part:'分项练习',speaking:'口语模考'}[cat]||'学习记录')+'</span></div><span class="rv2-rec-score">'+esc(r.main)+'<small>'+esc(r.mainLabel)+'</small></span>'+recActs(r)+'<button class="rv2-detail" data-rv2-detail="'+esc(r.id)+'" data-kind="'+esc(r.kind)+'">详情</button></div>'}).join('')+(pool.length>list.length?'<div class="rv2-rec-empty">当前显示最近三次，右上角可切换全部记录。</div>':'')
}
/* ?rec=<id> 定位：渲染后按 data-rec-id 找到行、滚到中间、轻高亮 2 秒。
   找不到（记录被删/老书签/参数乱写/还没渲染出来）→ 不报错、不滚动，页面照常。
   ⚠️ 必须从 paint() 里调，不能只在 boot() 调一次：boot 那一刻 DATA 可能还没到
   （paint 会早退），rows 还不存在 —— 早设 done 就永久错过（实测踩过）。
   一次定位成功后就锁死（软导航重跑不反复滚）。 */
function focusRec(){
 if(window.__rv2RecFocusDone)return;
 var rid='';try{rid=new URLSearchParams(location.search).get('rec')||''}catch(e){rid=''}
 if(!rid)return;
 var row=document.querySelector('#recAll .rv2-rec-row[data-rec-id="'+cssq(rid)+'"]');
 if(!row)return;                     /* 还没渲染出来 → 下次 paint 再试 */
 window.__rv2RecFocusDone=true;
 try{row.scrollIntoView({block:'center',behavior:'smooth'})}catch(e){row.scrollIntoView()}
 row.classList.add('rv2-rec-focus');
 setTimeout(function(){try{row.classList.remove('rv2-rec-focus')}catch(e){}},2000)
}
function performance(){
 var cutoff=new Date();cutoff.setDate(cutoff.getDate()-29);var cut=statRange==='recent'?todayKey(cutoff):'';var recs=(Array.isArray(DATA.mockRecords)?DATA.mockRecords:[]).filter(function(r){return !cut||String(r.date||'')>=cut});
 var out=SUBS.map(function(s){var rows=recs.filter(function(r){return r&&(r.type===s.k||s.k==='speaking'&&(r.kind==='speaking'||(!Array.isArray(r.parts)&&r.p1)))});if(s.k==='listening'||s.k==='reading'){var c=0,t=0;rows.forEach(function(r){(r.parts||[]).forEach(function(p){c+=Number(p.correct)||0;t+=Number(p.total)||0})});var pct=t?Math.round(c/t*100):null;return '<div class="rv2-perf-item"><h3>'+s.n+'</h3><b>'+(pct==null?'暂无':pct+'%')+'</b>'+(pct==null?'':'<div class="rv2-bar"><i style="width:'+pct+'%"></i></div>')+'<p>'+rows.length+' 次练习 · '+(t?c+' / '+t+' 题':'完成练习后显示正确率')+'</p></div>'}
 var secs=rows.reduce(function(a,r){return a+(Number(r.usedSec)||Number(r.durationSec)||Number(r.duration)||0)},0);var label=s.k==='writing'?'写作练习':'口语模考';return '<div class="rv2-perf-item"><h3>'+s.n+'</h3><b>'+rows.length+' 次</b><p>'+label+' · '+(secs?'累计 '+duration(secs):'练习记录不重复显示分数')+'</p></div>'});
 if(!recs.length)$('rv2PerfGrid').innerHTML=window.RVE.inline({ic:'bars',title:'这一时间段还没有分项练习',desc:'完成一次练习后，这里会显示正确率或练习量。',roomy:true,style:'grid-column:1/-1'});else $('rv2PerfGrid').innerHTML=out.join('')
}
function bind(){
 if(document.documentElement.__rv2Bound)return;document.documentElement.__rv2Bound=true;
 document.addEventListener('click',function(ev){var el=ev.target&&ev.target.closest?ev.target:null;if(!el)return;
  var add=el.closest('[data-rv2-add]');if(add){ev.preventDefault();saveCounts={whole:scores().length,part:Array.isArray(DATA.mockRecords)?DATA.mockRecords.length:0};var d=$('rv2AddDialog');if(d&&!d.open)d.showModal();return}
  var kind=el.closest('.rv2-kind [data-kind]');if(kind){ev.preventDefault();document.querySelectorAll('.rv2-kind button').forEach(function(b){b.classList.toggle('active',b===kind)});$('scAddWrap').hidden=kind.dataset.kind!=='whole';$('mkAddWrap').hidden=kind.dataset.kind!=='part';return}
  var tr=el.closest('#rvxTrendChips [data-k]');if(tr){ev.preventDefault();
   /* 个数视角下点不适用科目 → 自动弹回分数 + 琥珀提示 2.4s（与样子稿口径一致，R7 弹回不另造空态） */
   var nk=tr.dataset.k;
   var _bounced=false;
   if(view==='count'&&nk!=='listening'&&nk!=='reading'){
    view='score';window.__rvxTrendView='score';_bounced=true;
    document.querySelectorAll('#rvxTrendView button').forEach(function(b){b.classList.toggle('active',b.dataset.view==='score')});
   }
   pick=nk;document.querySelectorAll('#rvxTrendChips button').forEach(function(b){b.classList.toggle('active',b===tr)});
   trend();  /* 先画正常图（trend() 会重写 goalText），再盖弹回提示 */
   if(_bounced){
    var gEl=$('rv2GoalText');gEl.textContent=(SUBS.filter(function(s){return s.k===nk})[0]||{n:'总分'}).n+'没有对题个数概念，已切回按分数';
    gEl.style.color='var(--warn)';
    clearTimeout(window.__rvxTrendBounceT);
    window.__rvxTrendBounceT=setTimeout(function(){gEl.style.color='';trend()},2400);
   }
   return}
  /* TREND-AXIS-1：按分数/按对题个数视图切换 */
  var vw=el.closest('#rvxTrendView [data-view]');if(vw){ev.preventDefault();
   view=vw.dataset.view;window.__rvxTrendView=view;
   document.querySelectorAll('#rvxTrendView button').forEach(function(b){b.classList.toggle('active',b===vw)});
   trend();return}
  /* RV-REC-CHIP-1：成绩记录的类型筛选。状态存 window.__rv2Chip，重绘交给 records() */
  var chipBtn=el.closest('#recAllChips button[data-k]');if(chipBtn){ev.preventDefault();window.__rv2Chip=chipBtn.dataset.k;records();return}
  if(el.closest('#rvxWeakGo')){ev.preventDefault();var k=$('rvxWeakGo').dataset.subject;location.href=k==='settings'?'settings.html?pane=targets':k==='speaking'?'speaking.html':(k?'bank.html?ch='+k:'bank.html');return}
  /* RV-RECALL-KEEP-1：两个按钮的处理，逻辑抄 rec-all.js 同源那套 */
  var lb=el.closest('[data-rec-last]');
  if(lb){ev.preventDefault();var lid=lb.dataset.recLast;if(lid)location.href='review.html?rec='+encodeURIComponent(lid);return}
  var ab=el.closest('[data-rec-again]');
  if(ab){ev.preventDefault();var aid=ab.dataset.recAgain;
   var src=(window.__rv2RecList||[]).filter(function(x){return x&&String(x.id)===String(aid)})[0];
   var opener=window.__hubOpenFullTestFromIds;
   if(typeof opener!=='function'){alert('重做入口还没就绪，请刷新页面后再试。');return}
   var rt=src&&src.type||'reading';
   if(rt==='listening'){alert('听力整卷重做会在下一批开放。现在可以点「看上次结果」看那场的成绩与错题。');return}
   var ids=src&&Array.isArray(src.ids)?src.ids:null;
   if(!ids||ids.length!==3){
    if(!confirm('这场是老记录，当时没存用的是哪几篇，将随机组一套新的。\n新卷和这场成绩不能直接比，继续？'))return;
    opener(null);return}
   if(!opener(ids)&&confirm('这套卷里有篇目已经找不到了（题库更新过），重做只能随机组一套新的。继续？'))opener(null);
   return}
  var det=el.closest('[data-rv2-detail]');if(det){ev.preventDefault();openDetail(det.dataset.rv2Detail,det.dataset.kind);return}
  if(el.closest('[data-close-detail]')){$('rv2DetailDialog').close();return}
  var del=el.closest('#rv2DetailBody .rec-del');if(del){ev.preventDefault();var orig=document.querySelector('#rvLegacy '+(del.dataset.kind==='whole'?'#scoreList':del.dataset.kind==='part'?'#mkList':'#mockHistoryList')+' [data-del="'+cssq(del.dataset.id)+'"],#rvLegacy #mockHistoryList [data-id="'+cssq(del.dataset.id)+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var md=el.closest('#rv2DetailBody .plan-del[data-del]');if(md){ev.preventDefault();var orig=document.querySelector('#rvLegacy [data-del="'+cssq(md.dataset.del)+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var mh=el.closest('#rv2DetailBody .mock-hist-del[data-id]');if(mh){ev.preventDefault();var orig=document.querySelector('#rvLegacy #mockHistoryList .mock-hist-del[data-id="'+cssq(mh.dataset.id)+'"]');if(orig){orig.click();$('rv2DetailDialog').close()}return}
  var mt=el.closest('#rv2DetailBody .mock-hist-toggle[data-id]');if(mt){ev.preventDefault();var orig=document.querySelector('#rvLegacy #mockHistoryList .mock-hist-toggle[data-id="'+cssq(mt.dataset.id)+'"]');if(orig){orig.click();var body=document.getElementById('mh-'+mt.dataset.id);if(body)body.hidden=orig.textContent.indexOf('展开')>=0;mt.textContent=orig.textContent}return}
  if(el.closest('#rv2DialogForm #addScore, #rv2DialogForm #mkAdd')){
   if(submitting)return;submitting=true;var saveButton=el.closest('#addScore, #mkAdd');saveButton.disabled=true;
   setTimeout(function(){var isWhole=saveButton.id==='addScore',n=isWhole?scores().length:DATA.mockRecords.length,key=isWhole?'whole':'part';if(saveCounts[key]!==null&&n>saveCounts[key]){var d=$('rv2AddDialog');if(d.open)d.close()}saveButton.disabled=false;submitting=false;paint()},50)
  }
 });
 document.addEventListener('change',function(ev){if(ev.target===$('recordFilter'))records();if(ev.target===$('rv2StatRange')){statRange=ev.target.value;performance()}});
 /* 云数据合并后会重绘整页（记录、图表都长出来），页面一长高，deepLink 之前滚好的位置
    就被推回去了（实测软导航进来滚到 401，随后又被推回 371）。合并后补跑一次 paint + deepLink，
    让落点重新对齐；deepLink 自己只在 url 带 sub 时动作，普通进入不会乱滚。 */
 document.addEventListener('hub:data-merged',function(){setTimeout(function(){paint();deepLink()},50)});
}
function openDetail(id,kind){var body=$('rv2DetailBody'),src=kind==='whole'?$('scoreList'):kind==='part'?$('mkList'):$('mockHistoryList');body.innerHTML='';if(src)Array.prototype.forEach.call(src.children,function(node){if(kind==='whole'&&!node.querySelector('[data-del="'+cssq(id)+'"]'))return;if(kind==='part'&&!node.querySelector('[data-del="'+cssq(id)+'"]'))return;if(kind==='speaking'&&node.dataset.id!==String(id))return;body.appendChild(node.cloneNode(true))});if(kind==='whole'){var t=targets(),has=Number(t.overall)>0;body.querySelectorAll('.badge.up,.badge.down').forEach(function(b){if(!has){b.textContent='目标未设';b.classList.remove('up','down')}})}if(!body.children.length)body.innerHTML='<p>这条记录的原始明细暂未加载，请稍后再看。</p>';var d=$('rv2DetailDialog');if(!d.open)d.showModal()}
function paint(){if(typeof DATA==='undefined'||!DATA)return;summary();trend();records();performance();focusRec()}
/* RV-DEEPLINK-SCROLL-1（11-05，第 6 件第一笔）
   原来 deepLink() 在 boot() 里紧跟 paint() 同步跑：records() 刚写完 innerHTML 就立刻
   scrollIntoView，那一刻布局还没算完（软导航进来的尤其明显）—— 实测滚了个空。
   前两版改成「等一帧 + 补几次」，仍差 ~370px：滚完当下它确实贴到了位置，但**页面随后还在长高**
   （记录渲染、hub:data-merged 云数据合并后重绘），落点又被推下去，而那时重试已经收工。
   本版改成「盯着高度变化补位」：短窗口内既定时补位、又用 ResizeObserver 盯 body/main 的高度变化，
   只要 #recAll 又跑出视口顶就重新对齐；窗口一过就撒手，不打扰用户后续滚动。
   注意：窄档（body.has-dock）滚动在内层 main.container，桌面滚 window —— 两条路各按容器偏移设一次。 */
function deepLinkScroll(sel){
  function align(){
    var el = $(sel);
    if(!el) return false;
    var t = el.getBoundingClientRect().top;
    if(t > -28 && t < 28) return true;            /* 已经在视口顶附近，不用动 */
    try{ el.scrollIntoView({ block: 'start' }); }catch(e){}
    try{
      var main = document.querySelector('main.container');
      var off = $(sel).getBoundingClientRect().top - 8;
      if(main && main.scrollHeight > main.clientHeight + 4){
        var want = main.scrollTop + off;
        if(want > 0) main.scrollTop = want;
      }else if(off > 0 || (window.scrollY || 0) > 0){
        window.scrollTo(0, Math.max(0, (window.scrollY || 0) + off));
      }
    }catch(e2){}
    return false;
  }
  align();
  var ticks = 0, timer = setInterval(function(){
    ticks++;
    if(align() && ticks > 2) { /* 连续贴住就不再频繁补位，但仍由 observer 兜底 */
      if(ticks >= 4) clearInterval(timer);
    }
    if(ticks >= 10) clearInterval(timer);
  }, 150);
  try{
    var ob = new ResizeObserver(function(){ align(); });
    ob.observe(document.body);
    var main = document.querySelector('main.container');
    if(main) ob.observe(main);
    setTimeout(function(){ ob.disconnect(); }, 2500);
  }catch(e3){}
}
function deepLink(){
 var sub=new URLSearchParams(location.search).get('sub');
 if(sub==='record'||sub==='trajectory'||sub==='history'){
  var f=$('recordFilter');if(f){f.value='all';records()}
  deepLinkScroll('recAll');
 }else if(sub==='score'||sub==='breakdown'||sub==='overall'||sub==='speaking'){
  deepLinkScroll('rv2Summary');
 }
}
function boot(){bind();paint();deepLink();window.hubRepaintReviewE=paint}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
