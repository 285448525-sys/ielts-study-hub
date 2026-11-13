(function(){
  if(window.__bankRecords){ try{ window.__bankRecords.mount(); }catch(e){} return; }
  var $ = function(s,r){ return (r||document).querySelector(s); };
  var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
  var Q1 = String.fromCharCode(39), Q2 = String.fromCharCode(34);
  function esc(s){ return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split(Q2).join('&quot;').split(Q1).join('&#39;'); }
  function pad(n){ n=Number(n)||0; return n<10?('0'+n):String(n); }
  function cutoff(range){ if(range!=='recent') return ''; var d=new Date(); d.setDate(d.getDate()-9); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function fmtDate(s){ var p=String(s||'').split('-'); return p.length>=3?(Number(p[1])+' 月 '+Number(p[2])+' 日'):(String(s||'')||'—'); }
  function fmtUsed(sec){ var u=Math.max(0,Math.round(Number(sec)||0)); return Math.floor(u/60)+':'+pad(u%60); }
  function chName(t){ return t==='listening'?'听力':'阅读'; }
  var QT={fill:'填空题',single:'单选题',multi:'多选题',match:'匹配题',head:'Heading 题',para:'段落匹配题',map:'地图题',other:'其他题型'};
  function qtName(c){ return QT[c]||c||'其他'; }
  function pct(a){ return a.t?Math.round(a.c/a.t*100):0; }
  function byPct(a,b){ return (a.pct-b.pct)||(b.t-a.t)||(a.name<b.name?-1:1); }
  function recs(range){ var out=[],C=cutoff(range); try{ var A=(typeof DATA!=='undefined'&&DATA&&Array.isArray(DATA.mockRecords))?DATA.mockRecords:[]; for(var i=0;i<A.length;i++){ var r=A[i]; if(!r||r.src!=='bank')continue; if(!Array.isArray(r.detail)||!r.detail.length)continue; if(C&&String(r.date||'')<C)continue; out.push(r); } }catch(e){} return out; }
  function sstat(r){ var ok=0,tot=0,d=r.detail||[]; for(var i=0;i<d.length;i++){ tot++; if(d[i]&&d[i].ok)ok++; } return {ok:ok,tot:tot}; }
  var _mfP=null,_mf={};
  function partNum(v){ var s=String(v==null?'':v),n=''; for(var i=0;i<s.length;i++){ var c=s.charAt(i); if(c>='0'&&c<='9')n+=c; } return n?('Part '+Number(n)):(s||''); }
  function manifest(){ if(_mfP)return _mfP; _mfP=fetch('bank/manifest.json').then(function(x){return x.json();}).then(function(m){ var map={},al=(m&&m.albums)||[]; for(var i=0;i<al.length;i++){ var ch=al[i].channel,us=al[i].units||[]; for(var j=0;j<us.length;j++){ var u=us[j]; if(u&&u.id!=null)map[String(u.id)]={part:partNum(u.partNum),ch:ch,title:String(u.titleZh||u.title||'')}; } } _mf=map; return map; }).catch(function(){ _mf={}; return _mf; }); return _mfP; }
  function qtypeAgg(R){ var g={}; R.forEach(function(r){ (r.detail||[]).forEach(function(d){ var c=(d&&d.t)?String(d.t):''; if(!c)return; var a=g[c]||(g[c]={c:0,t:0,name:qtName(c)}); a.t++; if(d.ok)a.c++; }); }); return Object.keys(g).map(function(k){var a=g[k];return {key:k,name:a.name,c:a.c,t:a.t,pct:pct(a)};}).sort(byPct); }
  function partAgg(R){ var g={}; R.forEach(function(r){ var ch=chName(r.type); if(r.granularity==='whole'){ var ps=r.parts||[],ids=r.ids||[]; for(var i=0;i<ps.length;i++){ var e=_mf[String(ids[i])]; if(!e||!e.part)continue; var k=ch+' '+e.part; var a=g[k]||(g[k]={c:0,t:0}); a.c+=Number(ps[i]&&ps[i].correct)||0; a.t+=Number(ps[i]&&ps[i].total)||0; } }else{ var e2=_mf[String(r.unitId)]; if(e2&&e2.part){ var k2=ch+' '+e2.part; var a2=g[k2]||(g[k2]={c:0,t:0}); var st=sstat(r); a2.c+=st.ok; a2.t+=st.tot; } } }); return Object.keys(g).map(function(k){var a=g[k];return {key:k,name:k,c:a.c,t:a.t,pct:pct(a)};}).sort(byPct); }
  function uidForDetail(r,k){ if(r.granularity!=='whole'){ return r.unitId!=null?String(r.unitId):''; } var ps=r.parts||[],ids=r.ids||[],acc=0; for(var i=0;i<ps.length;i++){ var t=Number(ps[i]&&ps[i].total)||0; if(k<acc+t)return ids[i]!=null?String(ids[i]):''; acc+=t; } return ids.length?String(ids[ids.length-1]):''; }
  function wrongGroups(R){ var g={}; R.forEach(function(r){ var ch=chName(r.type),d=r.detail||[],date=String(r.date||''); for(var k=0;k<d.length;k++){ var it=d[k]; if(!it||it.ok)continue; var uid=uidForDetail(r,k)||('r'+String(r.id||'')); var qn=String(it.qn!=null?it.qn:(k+1)); var key=ch+'|'+uid+'|'+qn; var w=g[key]||(g[key]={key:key,ch:ch,uid:uid,qn:qn,times:0,lastDate:'',lastUser:'',lastRight:'',t:(it.t?String(it.t):'')}); w.times++; if(!w.lastDate||date>=w.lastDate){ w.lastDate=date; w.lastUser=String(it.user==null?'':it.user); w.lastRight=String(it.right==null?'':it.right); if(it.t)w.t=String(it.t); } } }); var arr=Object.keys(g).map(function(k){return g[k];}); arr.sort(function(a,b){return b.times-a.times||(b.lastDate>a.lastDate?1:-1);}); return arr; }
  var S={range:'all',scope:'all',sr:'all',jump:null,open:null,sel:null};
  function recHasPart(r,label){ var ch=chName(r.type); if(r.granularity==='whole'){ var ids=r.ids||[]; for(var i=0;i<ids.length;i++){ var e=_mf[String(ids[i])]; if(e&&e.part&&(ch+' '+e.part)===label)return true; } }else{ var e2=_mf[String(r.unitId)]; if(e2&&e2.part&&(ch+' '+e2.part)===label)return true; } return false; }
  function recFiltered(){ var R=recs(S.range); return R.filter(function(r){ if(S.scope==='reading'&&r.type!=='reading')return false; if(S.scope==='listening'&&r.type!=='listening')return false; if(S.scope==='whole'&&r.granularity!=='whole')return false; if(S.scope==='part'&&r.granularity!=='part')return false; if(S.jump){ if(S.jump.kind==='type'){ var has=false; (r.detail||[]).forEach(function(d){ if(d&&String(d.t||'')===S.jump.val)has=true; }); if(!has)return false; } else if(S.jump.kind==='part'){ if(!recHasPart(r,S.jump.val))return false; } } return true; }); }
  function chips(group,items){ return items.map(function(it){ return `<button type='button' class='br-chip${S[group]===it[0]?' on':''}' data-brg='${group}' data-brv='${esc(it[0])}'>${esc(it[1])}</button>`; }).join(''); }
  function detailHtml(r){ var d=r.detail||[]; var cells=d.map(function(it){ var hit=!!(it&&it.ok),u=String(it&&it.user!=null?it.user:''),mk=hit?'✓':'✕'; return `<div class='br-qc ${hit?'hit':'miss'}' title='正确答案：${esc(String(it&&it.right!=null?it.right:''))}'><span class='qn'>${esc(String(it&&it.qn!=null?it.qn:''))}<b class='mk'>${mk}</b></span><span class='qv'>${esc(u||'—')}</span><span class='qt'>${esc(qtName(it&&it.t?String(it.t):''))}</span></div>`; }).join(''); return `<div class='br-dtop'><p>共 ${d.length} 题 · 勾=答对，叉=答错（悬停看正确答案）</p></div><div class='br-qgrid'>${cells}</div><p class='br-legend'><span class='br-ok'>✓ 答对</span><span class='br-bad'>✕ 答错</span></p>`; }
  function renderRec(){ var box=$('#brRec'); if(!box)return; var R=recFiltered(),all=recs('all'),qs=0,ok=0,last=''; all.forEach(function(r){ var st=sstat(r); qs+=st.tot; ok+=st.ok; if(String(r.date||'')>last)last=String(r.date||''); }); var pv=qs?Math.round(ok/qs*100):0; var chip=(S.jump?`<span class='br-jump'>只看 ${esc(S.jump.name)} <button type='button' data-br-clearjump='1' aria-label='清除筛选'>×</button></span>`:''); var head=''; var band=`<div class='br-band br-band-tight'><div class='br-cell lead'><div class='v num'>${pv}<small>%</small></div><p class='k'>总正确率</p></div><div class='br-cell'><div class='v num'>${all.length}</div><p class='k'>场次</p></div><div class='br-cell'><div class='v num'>${qs}<small>题</small></div><p class='k'>做题</p></div><div class='br-cell'><div class='v num date'>${last?esc(fmtDate(last)):'—'}</div><p class='k'>最近一次</p></div></div>`; var tools=`<div class='br-tools'><div class='br-tg'>${chips('scope',[['all','全部'],['reading','阅读'],['listening','听力']])}</div><details class='br-more'><summary>更多筛选</summary><div class='br-more-box'><div class='br-tg'><span class='lab'>范围</span>${chips('scope',[['whole','整卷'],['part','单篇']])}</div><div class='br-tg'><span class='lab'>时间</span>${chips('range',[['all','全部时间'],['recent','近十天']])}</div></div></details>${chip}<span class='br-hint'>共 ${R.length} 场 · ${R.reduce(function(s,r){return s+sstat(r).tot;},0)} 题</span></div>`; var rows=R.map(function(r,i){ var st=sstat(r),gran=r.granularity==='whole'?'整卷':'单篇'; var sub=(r.granularity==='whole')?('完整模考 · '+(r.parts||[]).length+' 篇'):esc(String((r.parts&&r.parts[0]&&r.parts[0].label)||(_mf[String(r.unitId)]&&_mf[String(r.unitId)].title)||'单篇')); var open=(S.open===i); return `<div class='br-sw'><button type='button' class='br-sess${open?' open':''}' data-sess='${i}' aria-expanded='${open?'true':'false'}' aria-controls='brd-${i}'><span class='dt'>${esc(fmtDate(r.date))}</span><span class='src'><b>${chName(r.type)} · ${gran}</b><span>${sub}</span></span><span class='score num'>${st.ok}/${st.tot}</span><span class='tm num'>${fmtUsed(r.usedSec)}</span><span class='arw'>›</span></button><div class='br-detail' id='brd-${i}'${open?'':' hidden'}>${detailHtml(r)}</div></div>`; }).join(''); var table=`<div class='br-table'${R.length?'':' hidden'}><div class='br-thead'><span>日期</span><span>来源</span><span class='r'>答对</span><span class='r'>用时 mm:ss</span><span></span></div>${rows}</div>`; var empty=`<div class='br-empty'${R.length?' hidden':''}><b>还没有练习记录</b>去机经做一篇阅读或听力，交卷后这里会自动记一笔。</div>`; var _mo=box.querySelector('.br-more'),_moOpen=_mo&&_mo.open;box.innerHTML=head+band+tools+table+empty;if(_moOpen){var _m2=box.querySelector('.br-more');if(_m2)_m2.open=true;} }
  function bars(list,kind){ if(!list.length)return `<p class='br-none'>这一档还没有可统计的明细。</p>`; return list.map(function(b,i){ var weak=(i===0&&list.length>1); return `<button type='button' class='br-bar${weak?' weak':''}' data-brjump='${kind}' data-brval='${esc(b.key)}' data-brname='${esc(b.name)}'><span class='lb'>${esc(b.name)}${weak?`<em>最弱</em>`:''}</span><span class='br-track'><i style='width:${b.pct}%'></i></span><span class='vv num'><b>${b.pct}%</b> ${b.c}/${b.t}</span></button>`; }).join(''); }
  function renderStatInner(){ var box=$('#brStat'); if(!box)return; var R=recs(S.sr),types=qtypeAgg(R),parts=partAgg(R); var w=types[0]; var call=w?`最该先练的是 <b>${esc(w.name)}（${w.c}/${w.t}，${w.pct}%）</b>；点任意一条横条，会带着筛选回到题目记录。`:`做几套题之后，这里会算出各题型与 Part 的正确率，正确率低的排最上。`; var head=''; var tools=`<div class='br-tools'><div class='br-tg'><span class='lab'>时间</span>${chips('sr',[['all','全部时间'],['recent','近十天']])}</div><span class='br-hint'>只算机经里真实做过的题</span></div>`; var grid=`<div class='br-stat-grid'><div class='br-sbox'><h3>按题型</h3><p class='sub'>和回顾页同一套题型口径；段落匹配与 Heading 分开算，没做过的题型不画 0%。</p>${bars(types,'type')}</div><div class='br-sbox'><h3>按 Part</h3><p class='sub'>阅读 Part 1–3、听力 Part 1–4；由篇号反查题库目录得到。</p>${bars(parts,'part')}</div></div>`; var note=`<div class='br-callout'>${call}</div><p class='br-scope'>口径说明：手动录入的成绩、没有逐题明细的老场次都不计入；老记录没有题型字段时跳过，不显示成 0%。</p>`; box.innerHTML=head+tools+grid+note; }
  function renderStat(){ manifest().then(function(){ renderStatInner(); renderWrong(); }); }
  function renderWrong(){ var box=$('#brWrong'); if(!box)return; var W=wrongGroups(recs('all')); var head=''; var rows=W.map(function(w,i){ var e=_mf[w.uid]||{},where=esc(e.title||('篇号 '+w.uid)); return `<button type='button' class='br-wrow${S.sel===i?' sel':''}' data-wi='${i}'><span class='br-wqn num'>${esc(w.qn)}</span><span class='br-wm'><b>${where} · ${esc(qtName(w.t))}</b><span>${esc(w.ch)} · 错 ${w.times} 次 · 最近 ${esc(fmtDate(w.lastDate))}</span></span><span class='br-wcnt'>${w.times}</span></button>`; }).join(''); var sel=W[S.sel]; var np=sel?`<div class='br-npanel'><h3>第 ${esc(sel.qn)} 题 · ${esc(qtName(sel.t))}</h3><dl class='br-kv'><dt>你的答案</dt><dd class='u num'>${esc(sel.lastUser||'—')}</dd><dt>正确答案</dt><dd class='r num'>${esc(sel.lastRight||'—')}</dd><dt>错误次数</dt><dd class='num'>${sel.times}</dd><dt>最近一次</dt><dd class='num'>${esc(fmtDate(sel.lastDate))}</dd></dl><p class='br-brief'>${esc((_mf[sel.uid]||{}).title||'')}　·　${esc(sel.ch)}　·　篇号 ${esc(sel.uid)}</p><button type='button' class='br-link' data-br-gorec='1'>在题目记录里看 ›</button></div>`:`<div class='br-npanel'><h3>选一道错题</h3><p class='br-where'>点左边任意一条，这里会显示你的答案和正确答案。</p></div>`; var empty=`<div class='br-empty'${W.length?' hidden':''}><b>还没有错题</b>做错的题会自动收进来，按同一道题合并，方便集中回顾。</div>`; box.innerHTML=head+`<div class='br-wrong-wrap'${W.length?'':' hidden'}><div class='br-wlist'>${rows}</div>${np}</div>`+empty; }
  function renderAll(){ renderRec(); renderWrong(); renderStat(); }
  function sync(name){ if(!name)name='reading'; var isBr=(name==='records'||name==='wrong'||name==='stats'); var root=$('#bankRoot'),panels=$('#brPanels'); if(root)root.hidden=isBr; if(panels)panels.hidden=!isBr; $$('#brPanels [data-brpanel]').forEach(function(el){ el.hidden=(el.getAttribute('data-brpanel')!==name); }); $$('#brTabs .br-tab').forEach(function(b){ var on=b.getAttribute('data-brtab')===name; b.classList.toggle('active',on); b.setAttribute('aria-selected',on?'true':'false'); }); }
  function applyTab(name){ var root=$('#bankRoot'); if(!root)return; if(name==='reading'||name==='listening'){ var btns=$$('#mockTabs .pill-tab'); for(var i=0;i<btns.length;i++){ if(btns[i].getAttribute('data-mtab')===name){ btns[i].click(); break; } } sync(name); return; } if(root.getAttribute('data-mock-tab')!==name)root.setAttribute('data-mock-tab',name); sync(name); if(name==='records')renderRec(); else if(name==='stats')renderStat(); else if(name==='wrong')renderWrong(); }
  function onClick(e){ var t=e.target; if(!t||!t.closest)return; var tab=t.closest('#brTabs .br-tab'); if(tab){ applyTab(tab.getAttribute('data-brtab')); return; } var ch=t.closest('[data-brg]'); if(ch){ var g=ch.getAttribute('data-brg'),v=ch.getAttribute('data-brv'); if(g==='range'||g==='scope'){ S[g]=v; S.open=null; renderRec(); }else if(g==='sr'){ S.sr=v; renderStat(); } return; } if(t.closest('[data-br-clearjump]')){ S.jump=null; renderRec(); return; } var ss=t.closest('[data-sess]'); if(ss){ var i=Number(ss.getAttribute('data-sess')); S.open=(S.open===i?null:i); renderRec(); return; } var bar=t.closest('[data-brjump]'); if(bar){ S.jump={kind:bar.getAttribute('data-brjump'),val:bar.getAttribute('data-brval'),name:bar.getAttribute('data-brname')}; S.scope='all'; S.range='all'; S.open=null; applyTab('records'); return; } var wi=t.closest('[data-wi]'); if(wi){ S.sel=Number(wi.getAttribute('data-wi')); renderWrong(); return; } if(t.closest('[data-br-gorec]')){ applyTab('records'); return; } }
  var CSS = `.br-tabs{display:flex;align-items:stretch;gap:32px;padding:0 22px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none;position:sticky;top:0;z-index:3;background:var(--surface)}
.br-tabs::-webkit-scrollbar{display:none}
/* 手机横滚渐隐：黑加透明度只是遮罩合成，浅深两档一致，不是主题色 */
@media(max-width:860px){
.br-tabs.fade-r{-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 28px),rgba(0,0,0,.3) 100%);mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 28px),rgba(0,0,0,.3) 100%)}
.br-tabs.fade-l{-webkit-mask-image:linear-gradient(90deg,rgba(0,0,0,.3) 0,#000 28px,#000 100%);mask-image:linear-gradient(90deg,rgba(0,0,0,.3) 0,#000 28px,#000 100%)}
.br-tabs.fade-l.fade-r{-webkit-mask-image:linear-gradient(90deg,rgba(0,0,0,.3) 0,#000 28px,#000 calc(100% - 28px),rgba(0,0,0,.3) 100%);mask-image:linear-gradient(90deg,rgba(0,0,0,.3) 0,#000 28px,#000 calc(100% - 28px),rgba(0,0,0,.3) 100%)}
}
.br-tab{flex:0 0 auto;background:none;border:0;position:relative;padding:14px 2px 12px;font:inherit;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap}
.br-tab:hover{color:var(--ink)}
.br-tab.active{color:var(--primary-600);font-weight:750}
.br-tab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--primary);border-radius:2px 2px 0 0}
.br-panels{padding:20px 22px 40px}
.br-band.br-band-tight{align-items:baseline;gap:24px;padding:4px 0 12px;margin:0 0 12px;border-bottom:1px solid var(--line);flex-wrap:nowrap;overflow-x:auto}
.br-band.br-band-tight .br-cell{flex:0 0 auto;display:flex;align-items:baseline;gap:7px}
.br-band.br-band-tight .br-cell .k{margin:0;order:2;font-size:11px}
.br-band.br-band-tight .br-cell .v{font-size:18px;order:1}
.br-band.br-band-tight .br-cell.lead .v{font-size:30px;color:var(--primary-600)}
.br-band.br-band-tight .br-cell .v small{font-size:11px}
.br-band.br-band-tight .br-cell .v.date{font-size:14px;padding-bottom:0}
.br-more{position:relative}
.br-more>summary{list-style:none;cursor:pointer;font-size:12px;color:var(--muted);padding:5px 9px;border:1px solid var(--line);border-radius:4px;white-space:nowrap}
.br-more>summary::-webkit-details-marker{display:none}
.br-more[open]>summary{border-color:var(--primary);color:var(--primary-600)}
.br-more-box{position:absolute;left:0;top:calc(100% + 6px);z-index:5;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:220px}
.br-more-box .br-tg .lab{width:34px;margin-right:4px}
.br-more>summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:4px}
.num{font-variant-numeric:tabular-nums}
.br-band{display:flex;align-items:flex-end;gap:32px;padding:8px 0 24px;flex-wrap:wrap}
.br-cell .k{font-size:11.5px;color:var(--muted);margin:0 0 8px}
.br-cell .v{font-size:26px;font-weight:750;letter-spacing:-.03em;line-height:1.1;color:var(--ink)}
.br-cell:first-child .v{font-size:32px}
.br-cell.lead .v{color:var(--primary-600)}
.br-cell .v small{font-size:12px;font-weight:600;color:var(--muted);margin-left:3px}
.br-cell .v.date{font-size:15px;padding-bottom:4px}
.br-tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.br-tg{display:flex;align-items:center;gap:4px}
.br-tg .lab{font-size:11.5px;color:var(--muted);margin-right:8px}
.br-chip{border:0;background:none;border-radius:4px;padding:5px 9px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer;white-space:nowrap}
.br-chip:hover{color:var(--ink);background:var(--surface-2)}
.br-chip.on{color:var(--primary-600);font-weight:700;background:var(--primary-50);box-shadow:inset 0 -2px 0 var(--primary)}
.br-hint{margin-left:auto;font-size:11.5px;color:var(--muted)}
.br-jump{font-size:11.5px;color:var(--primary-600);background:var(--primary-50);border-radius:4px;padding:4px 8px}
.br-jump button{border:0;background:none;color:inherit;cursor:pointer;font-size:13px;padding:0 0 0 4px}
.br-thead,.br-sess{display:grid;grid-template-columns:92px minmax(0,1fr) 88px 76px 18px;gap:12px;align-items:center}
.br-thead{padding:0 12px 8px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--line)}
.br-thead .r{text-align:right}
.br-sw{border-bottom:1px solid var(--line)}
.br-sess{width:100%;padding:16px 12px;border:0;background:none;text-align:left;color:inherit;cursor:pointer;position:relative}
.br-sess:hover,.br-sess.open{background:var(--surface-2)}
.br-sess.open::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--primary)}
.br-sess .dt{font-size:12px;color:var(--muted)}
.br-sess .src{min-width:0}
.br-sess .src b{display:block;font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-sess .src span{display:block;font-size:11.5px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-sess .score,.br-sess .tm{text-align:right;font-size:13.5px}
.br-sess .score{font-weight:700}
.br-sess .tm{font-size:12px;color:var(--muted)}
.br-sess .arw{color:var(--muted);text-align:center}
.br-sess.open .arw{color:var(--primary-600)}
.br-detail{padding:16px 12px 24px;background:var(--surface-2)}
.br-dtop p{margin:0 0 12px;font-size:11.5px;color:var(--muted)}
.br-qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px}
.br-qc{border:1px solid var(--line);border-left:2px solid var(--line);border-radius:4px;background:var(--surface);padding:6px}
.br-qc .qn{display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
.br-qc .qv{display:block;font-size:12.5px;font-weight:750;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.br-qc .qt{display:block;font-size:9.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-qc.hit{border-left-color:var(--ok-text);background:var(--ok-soft)}
.br-qc.hit .mk,.br-qc.hit .qv{color:var(--ok-text)}
.br-qc.miss{border-left-color:var(--err-text);background:var(--err-soft)}
.br-qc.miss .mk,.br-qc.miss .qv{color:var(--err-text)}
.br-legend{font-size:11px;color:var(--muted);margin:12px 0 0}
.br-legend .br-ok{color:var(--ok-text);margin-right:12px}
.br-legend .br-bad{color:var(--err-text)}
.br-empty{border:1px dashed var(--line);border-radius:8px;padding:48px 24px;text-align:center;color:var(--muted);font-size:12.5px;line-height:1.9}
.br-empty b{display:block;color:var(--ink);font-size:14px;margin-bottom:4px}
.br-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.br-sbox h3{margin:0 0 4px;font-size:13.5px;font-weight:750;padding-bottom:12px;border-bottom:1px solid var(--line)}
.br-sbox .sub{font-size:11.5px;color:var(--muted);margin:12px 0;line-height:1.7}
.br-bar{width:100%;display:grid;grid-template-columns:120px minmax(0,1fr) 92px;gap:12px;align-items:center;padding:8px 4px;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;color:inherit;cursor:pointer;border-radius:4px}
.br-bar:hover{background:var(--surface-2)}
.br-bar .lb{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-bar .lb em{font-style:normal;font-size:10px;color:var(--err-text);background:var(--err-soft);border-radius:4px;padding:1px 5px;margin-left:6px;font-weight:650}
.br-track{height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden}
.br-track i{display:block;height:100%;background:var(--primary)}
.br-bar.weak .br-track i{background:var(--err-text)}
.br-bar .vv{font-size:11.5px;color:var(--muted);text-align:right;white-space:nowrap}
.br-bar .vv b{color:var(--ink);font-size:13px}
.br-none{font-size:12px;color:var(--muted);padding:16px 0}
.br-callout{margin:24px 0 0;padding:12px 16px;background:var(--surface-2);border-left:2px solid var(--primary);border-radius:0 8px 8px 0;color:var(--ink-2);font-size:12.5px;line-height:1.8}
.br-callout b{color:var(--ink)}
.br-scope{font-size:11.5px;color:var(--muted);margin:12px 0 0;line-height:1.8}
.br-wrong-wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
.br-wlist{border-top:1px solid var(--line)}
.br-wrow{width:100%;display:flex;align-items:center;gap:12px;padding:12px;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;color:inherit;cursor:pointer;position:relative}
.br-wrow:hover,.br-wrow.sel{background:var(--surface-2)}
.br-wrow.sel::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--primary)}
.br-wqn{flex:none;width:32px;height:32px;border-radius:4px;background:var(--err-soft);color:var(--err-text);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:750}
.br-wm{flex:1;min-width:0}
.br-wm b{display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.br-wm span{display:block;font-size:11.5px;color:var(--muted);margin-top:3px}
.br-wcnt{flex:none;font-size:11px;color:var(--err-text);background:var(--err-soft);border-radius:4px;padding:2px 6px;font-weight:650}
.br-npanel{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:24px}
.br-npanel h3{margin:0;font-size:15px;font-weight:750}
.br-where{font-size:11.5px;color:var(--muted);margin:4px 0 16px;line-height:1.7}
.br-kv{display:grid;grid-template-columns:76px 1fr;gap:8px 12px;margin:0 0 16px;padding:0 0 16px;border-bottom:1px solid var(--line);font-size:12.5px}
.br-kv dt{color:var(--muted);font-size:11.5px}
.br-kv dd{margin:0;color:var(--ink-2);overflow-wrap:anywhere}
.br-kv dd.u{color:var(--err-text);font-weight:700}
.br-kv dd.r{color:var(--ok-text);font-weight:700}
.br-brief{font-size:12px;color:var(--muted);line-height:1.8}
.br-link{border:0;background:none;color:var(--primary-600);font:inherit;font-size:12px;font-weight:650;cursor:pointer;padding:4px 0}
.br-link:hover{text-decoration:underline}
.br-tab:focus-visible,.br-chip:focus-visible,.br-sess:focus-visible,.br-bar:focus-visible,.br-wrow:focus-visible,.br-link:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:4px}
@media(max-width:860px){.br-tabs{gap:24px;padding:0 12px}.br-panels{padding:16px 12px 40px}.br-band{gap:16px 24px}.br-cell{flex:1 0 42%}.br-band.br-band-tight{flex-wrap:wrap;gap:12px 20px;overflow-x:visible}.br-band.br-band-tight .br-cell{flex:1 0 42%}.br-thead{display:none}.br-sess{grid-template-columns:1fr 72px 18px;gap:8px;padding:12px 4px}.br-sess .dt{grid-column:1/-1;font-size:11px}.br-sess .tm{display:none}.br-stat-grid{grid-template-columns:1fr;gap:24px}.br-wrong-wrap{grid-template-columns:1fr}.br-hint{margin-left:0;width:100%}.br-bar{grid-template-columns:96px minmax(0,1fr) 78px}}
@media(prefers-reduced-motion:reduce){.br-tab,.br-sess,.br-bar{transition:none}}`;
  var TABS = `<div class='br-tabs' id='brTabs' role='tablist' aria-label='机经板块'>
<button class='br-tab active' type='button' data-brtab='reading' role='tab' aria-selected='true'>阅读</button>
<button class='br-tab' type='button' data-brtab='listening' role='tab' aria-selected='false'>听力</button>
<button class='br-tab' type='button' data-brtab='records' role='tab' aria-selected='false'>题目记录</button>
<button class='br-tab' type='button' data-brtab='wrong' role='tab' aria-selected='false'>错题集</button>
<button class='br-tab' type='button' data-brtab='stats' role='tab' aria-selected='false'>正确率统计</button>
</div>
<div class='br-panels' id='brPanels' hidden>
<section class='br-panel' data-brpanel='records' id='brRec' hidden></section>
<section class='br-panel' data-brpanel='wrong' id='brWrong' hidden></section>
<section class='br-panel' data-brpanel='stats' id='brStat' hidden></section>
</div>`;
  function tabFade(){ var box=$('#brTabs'); if(!box)return; var max=box.scrollWidth-box.clientWidth,x=box.scrollLeft; box.classList.toggle('fade-r',max>2&&x<max-2); box.classList.toggle('fade-l',max>2&&x>2); }
  function bindFade(){ var box=$('#brTabs'); if(!box)return; if(window.__brScroll){ try{ box.removeEventListener('scroll',window.__brScroll); window.removeEventListener('resize',window.__brScroll); }catch(e){} } window.__brScroll=tabFade; box.addEventListener('scroll',tabFade,{passive:true}); window.addEventListener('resize',tabFade); tabFade(); }
  function bind(){ if(window.__brClick){ try{ document.removeEventListener('click',window.__brClick); }catch(e){} } window.__brClick=onClick; document.addEventListener('click',onClick); if(window.__brMerged){ try{ document.removeEventListener('hub:data-merged',window.__brMerged); }catch(e){} } window.__brMerged=function(){ renderAll(); }; document.addEventListener('hub:data-merged',window.__brMerged); }
  function observe(){ if(window.__brObs){ try{ window.__brObs.disconnect(); }catch(e){} } var root=$('#bankRoot'); if(!root||typeof MutationObserver==='undefined')return; window.__brObs=new MutationObserver(function(){ sync(root.getAttribute('data-mock-tab')); }); try{ window.__brObs.observe(root,{attributes:true,attributeFilter:['data-mock-tab']}); }catch(e){} }
  function mount(){ if(!$('#brStyle')){ var st=document.createElement('style'); st.id='brStyle'; st.textContent=CSS; document.head.appendChild(st); } var main=$('.hub-main'); if(!main)return; if(!$('#brTabs'))main.insertAdjacentHTML('afterbegin',TABS); bind(); bindFade(); observe(); renderAll(); sync($('#bankRoot')?$('#bankRoot').getAttribute('data-mock-tab'):'reading'); }
  var API={ mount:mount,applyTab:applyTab,sync:sync,renderAll:renderAll,recs:recs,qtypeAgg:qtypeAgg,partAgg:partAgg,wrongGroups:wrongGroups,manifest:manifest,state:function(){return S;},setData:function(a){ try{ DATA.mockRecords=a; S.open=null; S.sel=null; S.jump=null; renderAll(); }catch(e){} },tabFade:tabFade };
  window.__bankRecords=API;
  mount();
})();
