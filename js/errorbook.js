/* 错题本（极简版）：一个大框粘 AI 讲解 → AI 结构化 → 自动归档 + 错因统计
   数据结构（kind:'ai'）：
   { id, date, kind:'ai', known, source,
     title, subject, qtype, trap, howto:[], wrongPoint, rule:[], words:[], raw }
   兼容老数据 kind:'question' / 'word'（只读渲染，不再提供录入表单）。 */

const EB_TRAPS = [
  'FALSE与NOT GIVEN混淆', '定位错段/定位丢失', '同义替换没认出', '原词陷阱(原词重现)',
  '比较级/绝对化词', '目的vs手段', '细节看漏(时态/数字/限定词)', '听力连读没听出',
  '听力答案抢跑/漏听', '拼写', '生词不认识', '时间不够/没做完', '粗心', '其他'
];

ready(() => {
  $('#ebAnalyze').addEventListener('click', analyzeEntry);
  $('#ebRaw').addEventListener('click', saveRawEntry);
  $('#fTrap').addEventListener('change', render);
  render();
});

/* ---------- 录入 ---------- */
/* 返回值：true = 成功归档（调用方可安全删除旧记录）；false = 未归档，原数据必须保留 */
async function analyzeEntry(){
  const box = $('#ebInput');
  const text = box.value.trim();
  if(text.length < 15){ toast('内容太短，把 AI 的讲解整段粘进来'); return false; }
  if(!DATA.settings.relayToken){
    toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下；也可以先点「只存原文」');
    return false;
  }

  const btn = $('#ebAnalyze');
  const load = $('#ebLoading');
  btn.disabled = true; btn.textContent = 'AI 分析中…';
  load.hidden = false;
  load.textContent = '正在把这段讲解拆成「怎么做 / 错点 / 规避规则」，大概十几秒…';

  const messages = [
    { role:'system', content:
`你是雅思错题诊断助手，服务对象是一名冲总分 6.0 的中国考生（弱项：听力、口语；阅读速度慢，且常把 FALSE 误判成 NOT GIVEN）。
用户会粘贴一段关于某道错题的资料——可能是别的 AI 写的讲解，也可能是她自己零散的笔记，格式混乱、有多余的话都正常。
你的任务：把它整理成结构化诊断。全部用简体中文，务实、具体、能照着做，不要空话套话。

字段要求：
- title：一句话说清这是哪道题/什么题（含来源题号，如「剑18 T2 P1 Q5 判断题」，资料没写就概括内容）。
- subject：只能是 阅读 / 听力 / 写作 / 口语 / 词汇 / 其他。
- qtype：题型，如 判断(TFNG)、填空、匹配、选择、Heading、简答、地图题、多选 等；判断不出写「其他」。
- trap：错因，必须从这个列表里挑最贴切的一个（原样照抄）：${EB_TRAPS.join(' / ')}
- howto：正确解法步骤，2-4 步，每步一句话，必须可执行（例如「圈题干定位词 renewable → 回原文扫第3段首句 → 对比原文说的是 A 而题干说 B → 判 FALSE」）。
- wrongPoint：一句话直击错点，具体到「你把 X 当成了 Y」或「错在哪一步」。
- rule：可迁移的判断规则 1-2 条，下次遇到同类怎么避免。
- words：资料里出现的值得记的生词，每项格式「word 中文释义」，没有就空数组。

特别规则：
- 若涉及判断题，必须在 rule 里写清两步判断：原文有没有提到这个信息（没提 → NOT GIVEN）；提到了是否与题干矛盾（矛盾 → FALSE）。
- 资料信息不足时，就基于已有信息给最有价值的部分，绝不编造原文内容。

只输出 JSON，不要任何解释文字、不要 markdown 围栏：
{"title":"","subject":"","qtype":"","trap":"","howto":["",""],"wrongPoint":"","rule":[""],"words":[""]}` },
    { role:'user', content: text }
  ];

  try{
    const content = await callRelay('errorbook', messages, 0.3);
    const r = aiJson(content);
    const entry = {
      id: uid(), date: todayKey(), kind:'ai', known:false, source: text
    };
    if(r){
      Object.assign(entry, {
        title: String(r.title || '').trim() || '（未命名错题）',
        subject: String(r.subject || '其他').trim(),
        qtype: String(r.qtype || '其他').trim(),
        trap: normTrap(r.trap),
        howto: toArr(r.howto),
        wrongPoint: String(r.wrongPoint || '').trim(),
        rule: toArr(r.rule),
        words: toArr(r.words)
      });
    } else {
      // AI 没按 JSON 回 → 原文照存，不丢东西
      Object.assign(entry, {
        title: '（AI 返回非标准格式，已存原文）', subject:'其他', qtype:'其他', trap:'其他',
        howto: [], wrongPoint: '', rule: [], words: [], raw: content
      });
    }
    DATA.errorbook.unshift(entry);
    hubSave();
    box.value = '';
    load.hidden = true;
    render();
    toast(r ? '已分析并归档' : 'AI 格式异常，已存原文');
    const first = document.querySelector('#list .eb-card');
    if(first) first.scrollIntoView({ behavior:'smooth', block:'center' });
    return true;
  }catch(e){
    load.textContent = 'AI 调不通：' + e.message + '　（可以先点「只存原文」，等有网/配好 Key 再补分析）';
    return false;
  }finally{
    btn.disabled = false; btn.textContent = '🤖 AI 分析并归档';
  }
}

/* 不走 AI，先把原文存下来，之后可以点卡片上的「补 AI 分析」 */
function saveRawEntry(){
  const box = $('#ebInput');
  const text = box.value.trim();
  if(text.length < 5){ toast('先写点东西'); return; }
  DATA.errorbook.unshift({
    id: uid(), date: todayKey(), kind:'ai', known:false, source: text,
    title:'（未分析）' + text.slice(0, 24).replace(/\s+/g,' '),
    subject:'其他', qtype:'其他', trap:'其他', howto:[], wrongPoint:'', rule:[], words:[]
  });
  hubSave();
  box.value = '';
  render();
  toast('已存原文，之后可点卡片「补 AI 分析」');
}

/* 对已存原文的记录补跑一次 AI
   ⚠️ 数据安全铁律：必须「分析成功之后」才删旧记录。
   AI 分析有多条失败路径（原文过短 / 没配 Key / 网络异常），若先删后跑，
   任何一条失败都会让用户手打/粘贴的原始资料永久消失且不可恢复。 */
async function reanalyze(id){
  const e = DATA.errorbook.find(x => x.id === id);
  if(!e || !e.source){ toast('这条没有原始资料，无法分析'); return; }

  const box = $('#ebInput');
  // 输入框里可能还有用户没保存的草稿，别默默冲掉
  const draft = box.value.trim();
  if(draft && draft !== e.source.trim()){
    if(!confirm('上面输入框里还有没归档的内容，继续会被这条记录的原文替换。要继续吗？')) return;
  }

  box.value = e.source;
  window.scrollTo({ top:0, behavior:'smooth' });

  const ok = await analyzeEntry();
  if(ok){
    // 新记录已归档，此时才安全地移除旧的那条
    DATA.errorbook = DATA.errorbook.filter(x => x.id !== id);
    hubSave();
    render();
  } else {
    // 失败：旧记录原样保留。提示写在 #ebLoading（不用 toast，免得盖掉上面「没填 Key」之类的具体原因）
    const load = $('#ebLoading');
    if(load){
      const prev = load.hidden ? '' : (load.textContent + '　');
      load.hidden = false;
      load.textContent = prev + '⚠️ 没分析成功，这条记录仍在下面列表里、原文没丢。原文已放进上面输入框，可以改完再点「AI 分析并归档」（成功后记得删掉旧的那条）。';
    }
  }
}

function normTrap(t){
  const s = String(t || '').trim();
  if(EB_TRAPS.includes(s)) return s;
  const hit = EB_TRAPS.find(x => s && (x.includes(s) || s.includes(x.slice(0,4))));
  return hit || '其他';
}
function toArr(v){
  if(Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if(v == null || v === '') return [];
  return [String(v).trim()];
}

/* ---------- 渲染 ---------- */
function render(){
  const traps = [...new Set(DATA.errorbook.map(e => e.trap).filter(Boolean))];
  const sel = $('#fTrap');
  const keep = sel.value;
  sel.innerHTML = '<option value="">全部错因</option>' +
    traps.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  sel.value = traps.includes(keep) ? keep : '';

  const ft = sel.value;
  const list = DATA.errorbook
    .filter(e => !ft || e.trap === ft)
    .slice()
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  $('#count').textContent = list.length;
  const box = $('#list');
  $('#empty').hidden = DATA.errorbook.length > 0;
  box.innerHTML = list.map(cardHtml).join('');

  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if(confirm('确定删除这条记录？')){
      DATA.errorbook = DATA.errorbook.filter(x => x.id !== b.dataset.del);
      hubSave(); render();
    }
  }));
  box.querySelectorAll('[data-known]').forEach(b => b.addEventListener('click', () => {
    const e = DATA.errorbook.find(x => x.id === b.dataset.known);
    if(e){ e.known = !e.known; hubSave(); render(); }
  }));
  box.querySelectorAll('[data-redo]').forEach(b => b.addEventListener('click', () => reanalyze(b.dataset.redo)));

  renderStats();
}

function cardHtml(e){
  if(e.kind === 'word')     return oldWordCard(e);
  if(e.kind === 'question') return oldQuestionCard(e);

  const badges = [
    e.subject && e.subject !== '其他' ? `<span class="badge">${escapeHtml(e.subject)}</span>` : '',
    e.qtype  && e.qtype  !== '其他' ? `<span class="badge">${escapeHtml(e.qtype)}</span>` : '',
    e.trap   && e.trap   !== '其他' ? `<span class="badge badge-trap">${escapeHtml(e.trap)}</span>` : '',
    e.known ? '<span class="badge badge-ok">已掌握</span>' : ''
  ].join('');

  const howto = (e.howto && e.howto.length)
    ? `<div class="eb-block"><h4>这道题怎么做</h4><ol>${e.howto.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>` : '';
  const wrong = e.wrongPoint
    ? `<div class="eb-block"><h4>错点在哪</h4><div class="eb-wrong">${escapeHtml(e.wrongPoint)}</div></div>` : '';
  const rule = (e.rule && e.rule.length)
    ? `<div class="eb-block"><h4>下次怎么避免</h4><div class="eb-rule">${e.rule.map(escapeHtml).join('<br>')}</div></div>` : '';
  const words = (e.words && e.words.length)
    ? `<div class="eb-block"><h4>顺手记的词</h4><div class="eb-words">${e.words.map(w => `<span class="eb-chip">${escapeHtml(w)}</span>`).join('')}</div></div>` : '';
  const raw = e.raw
    ? `<div class="eb-block"><h4>AI 原始回复</h4><p style="white-space:pre-wrap">${escapeHtml(e.raw)}</p></div>` : '';
  const src = e.source
    ? `<details class="eb-src"><summary>看我粘进来的原始资料</summary><pre>${escapeHtml(e.source)}</pre></details>` : '';
  const needRedo = !e.howto || !e.howto.length;

  return `<div class="eb-card">
    <div class="eb-head">${badges}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.title || '（未命名错题）')}</div>
    ${howto}${wrong}${rule}${words}${raw}${src}
    <div class="eb-actions">
      ${needRedo ? `<button class="btn btn-sm btn-primary" data-redo="${e.id}">🤖 补 AI 分析</button>` : ''}
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}

/* 老数据只读渲染（以前那套多字段表单存的） */
function oldQuestionCard(e){
  return `<div class="eb-card">
    <div class="eb-head"><span class="badge">${e.subject==='reading'?'阅读':'听力'}</span><span class="badge">${escapeHtml(e.qtype||'')}</span><span class="badge badge-trap">${escapeHtml(e.trap||'')}</span>${e.known?'<span class="badge badge-ok">已掌握</span>':''}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.stem||'')}</div>
    <div class="eb-block"><p class="muted">定位：${escapeHtml(e.locate||'—')}　|　原文：${escapeHtml(e.original||'—')}</p></div>
    <div class="eb-block"><div class="eb-wrong">错：${escapeHtml(e.wrong||'—')} → 正：${escapeHtml(e.right||'—')}</div></div>
    ${e.note ? `<div class="eb-block"><div class="eb-rule">${escapeHtml(e.note)}</div></div>` : ''}
    <div class="eb-actions">
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}
function oldWordCard(e){
  return `<div class="eb-card">
    <div class="eb-head"><span class="badge">单词</span>${e.known?'<span class="badge badge-ok">已掌握</span>':''}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.en||'')} <span class="muted" style="font-weight:400">${escapeHtml(e.cn||'')}</span></div>
    <div class="eb-actions">
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}

function renderStats(){
  const withTrap = DATA.errorbook.filter(e => e.trap && e.trap !== '其他');
  const card = $('#statsCard');
  if(withTrap.length < 2){ card.hidden = true; return; }
  card.hidden = false;
  const byTrap = {};
  withTrap.forEach(e => { byTrap[e.trap] = (byTrap[e.trap]||0) + 1; });
  const max = Math.max.apply(null, Object.values(byTrap));
  const rows = Object.entries(byTrap).sort((a,b) => b[1]-a[1]).map(([t,n]) => {
    const pct = Math.round(n / max * 100);
    return `<div class="stat-row"><span class="stat-label">${escapeHtml(t)}</span><div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div><span class="stat-num">${n}</span></div>`;
  }).join('');
  $('#statsBox').innerHTML = rows;
}
