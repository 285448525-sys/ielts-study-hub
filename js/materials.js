/* === 万能口语素材生成器 ===
   输入：A 人设 + B1~B5 核心(必填) + C1~C4 扩展(选填) + 可加经历
   处理：DeepSeek 把每段经历拆多切面、匹配自然可串的 P2 题、产出英文 keyword 骨架
   输出：人设锚点卡 + 素材卡(可展开编辑/重生成/删除) + 缺口清单，存 localStorage
   红线：不动 mock 系列 / speaking 系列 / data.js / callRelay；纯前端 + 现有 DeepSeek relay。 */
(function(){
  const STORE_KEY = 'ielts_materials_v1';
  const CANON = ['喜欢的城市','水边的地方','难忘的旅行','常在一起的人','户外活动','你拍的照片','让你放松的事','家人','朋友','敬佩的人','帮助者','让我骄傲的人','学会的技能','克服的困难','目标','压力','习惯改变','搬家','电子设备','工具','礼物','离不开的东西','爱好','视频','网上学的','改观的事','喜欢的节目','书','电影','歌','诗','故事','网站','衣服','贵的东西','珍藏','法律','规则','传统','习俗','改变','分歧','犯错','投诉','道歉','尴尬','挑战'];

  const QUESTIONS = [
    { id:'A',  group:'persona', required:true,  title:'一句话介绍你自己', hint:'城市、身份（学生/专业或工作）、性格、一个爱好。例：杭州，大三计算机，理性但开口说英语会紧张，喜欢无纸化学习。' },
    { id:'B1', group:'core', required:true,  title:'一次你和某个重要的人一起做的事 / 外出', hint:'和谁、去哪、做了什么、印象最深的瞬间（看到什么/当时心情）。尽量把"人+事+地+旅行"一次讲全，能少背一条素材。' },
    { id:'B2', group:'core', required:true,  title:'一件你学会 / 克服 / 坚持的事', hint:'一项技能，或一段咬牙坚持/克服困难的经历。最难的是什么？后来怎么变好？' },
    { id:'B3', group:'core', required:true,  title:'一个每天用或离不开的东西 / 日常爱好', hint:'物件（手机/电脑/乐器…）或爱好。它怎么融入生活？为什么离不开？' },
    { id:'B4', group:'core', required:true,  title:'一个在网上看到、让你改观或感兴趣的内容', hint:'B站/短视频/文章都行。讲了什么？为什么让你改观或感兴趣？' },
    { id:'B5', group:'core', required:true,  title:'一个对你重要的地方 / 一次印象深的经历', hint:'一个地方（家/学校/旅行地）或一次经历。它为什么重要？发生了什么让你记住？' },
    { id:'C1', group:'extra', required:false, title:'一本喜欢的书 / 一部电影 / 一首歌', hint:'采文化消费，覆盖 book/film/song（选填，能讲几个讲几个）。' },
    { id:'C2', group:'extra', required:false, title:'一件常穿或珍藏的衣服 / 珍贵礼物 / 贵的东西', hint:'采物件，覆盖 clothing/gift/expensive（选填）。' },
    { id:'C3', group:'extra', required:false, title:'一条影响过你的规则 / 法律 / 传统习俗', hint:'采规则维度，覆盖 law/rules/tradition/custom（选填）。' },
    { id:'C4', group:'extra', required:false, title:'一次冲突 / 犯错 / 投诉 / 道歉', hint:'采负面经历，覆盖 disagreement/mistake/complaint/apology（选填）。' }
  ];

  const SYS_MAT = '你是雅思口语串题素材教练。考生会给你一份人设 + 若干段真实生活经历（含可能来自你上一轮追问的补充回答）。\n'
  + '你的任务：把全部经历整合成**几个完整核心小故事**（数量灵活：看内容 + 对照下方 P2 全题型来定，通常 3~5 个，但不要凑数）。**必须把考生填入的每一段经历、每一个细节都完整纳入最终故事，不得遗漏、不得为了精简而丢弃任何一段内容。** 每个故事都能让考生直接背出来。\n'
  + '规则：\n'
  + '1. 故事必须基于考生原话，真实不编造。**完整性优先于精简**：若把相关经历合并成一个故事，必须把两段经历的所有人物、地点、事件、感受等关键信息和细节都完整写进去，不得省略任何一段你提供的经历内容；宁可多生成一个小故事，也绝不丢弃考生填的任何内容。\n'
  + '2. 每个故事含：title(标题) / storyEn(一段英文小故事，用**基础词汇**、短到中等长度的句子，靠 and / so / because / but / actually 等连接词串成有「起因→经过→感受→结尾」的**连贯叙事**，读起来像在讲一件事而不是清单；严禁连续堆砌孤立短句、严禁连续同一主语/同一动词；契合口语 5.5 水平，长度适中可直接背；storyEn 必须把该故事涵盖的考生经历细节全部写进去，不得遗漏) / logicZh(中文**逻辑链**：用若干中文短语以 "—"（中文横杠/破折号）串接，把故事的关键步骤、转折、感受、细节都铺开——越长越细越好、数量不固定，例如"朋友送手机壳—觉得很有心—每天用手机—看到就想起朋友—珍藏") / coverage(能套的 P2 题族数组)。\n'
  + '3. coverage 每个元素：{"topic":"题族名","fit":"natural|loose","note":"串题连接说明(给一句怎么把本故事套到该题，如\'旅行中意识到环保法重要→套法律法规\';natural可简写)"}。\n'
  + '4. 串题很抽象，**搭边就行**：coverage 不限于自然贴合的题，偏题（法律/规则/传统/人物/挑战…）只要能扯上关系就列，并给自然的连接说明。目标是背完这几个故事，大部分 P2 题都能套。\n'
  + '5. 不要产出 keyword 骨架 / 不要拆分多切面列表——考生基础弱，给词也不会说句型，必须给**成段的、能直接背的英文小故事**（句子可简单但必须连贯，靠连接词串成一件事）。\n'
  + '6. 判断素材是否够覆盖：对照 P2 全题型，如果现有经历明显缺某大类（如完全没提人或完全没提地点），且补 1-3 个问题就能补上，则在 followups 返回这些问题；如果已经够广，followups 返回空数组。\n'
  + 'P2 全题型参考：' + CANON.join('、') + '\n'
  + '输出严格 JSON：{"stories":[{"title":"","storyEn":"","logicZh":"","coverage":[{"topic":"","fit":"","note":""}]}],"followups":["还想了解的问题1","问题2"]}';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';
  const SYS_GAP = '你是雅思 P2 覆盖分析师。给定已被素材（含搭边串题）覆盖的 P2 题族，以及常见 IELTS P2 题族清单，请列出**连搭边都难覆盖**、且该用户大概率会考到的题族（最多 6 条），每条给一个**澄清性问题**——用第二人称直接问考生真实经历，问题要具体、好回答，比如"你最近半年有没有搬过家？搬去哪了？"、"你有没有哪款小工具是每天都用的？说说怎么用的？"。只列真正缺口，不要编造已覆盖的。输出严格 JSON 数组：[{"topic":"题族","question":"澄清性问题"}]';

  let store = loadStore();
  let mode = 'q';
  let editing = -1;   // 当前正在「更改」编辑的素材卡下标；-1 表示无

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.deletedIds = s.deletedIds || []; return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){ s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.deletedIds = s.deletedIds || []; DATA.materials = s; return s; }
    }catch(_){}
    return { persona:null, materials:[], gaps:[], followups:[], answers:{ extraMore:[], followups:[], gaps:[] } };
  }
  function saveStore(){
    if(DATA.materials && typeof DATA.materials === 'object') DATA.materials.materialsEpoch = Date.now();
    DATA.materials = store; hubSave();
  }
  function ans(id){ return (store.answers[id] || '').trim(); }

  /* ---------- 渲染分发 ---------- */
  function render(){
    const root = $('#matRoot'); if(!root) return;
    if(mode === 'result' && store.materials.length){ renderResults(root); }
    else { renderQuestionnaire(root); }
  }

  /* ---------- 问卷页 ---------- */
  function renderQuestionnaire(root){
    let h = '<div class="mat-intro">填 <b>6 题（人设 + 5 个核心经历）</b> 就能生成你的专属万能素材；想覆盖更多偏题，把下面 4 个<b>选填</b>也补上（共 10 题）。填一半关页不丢，下次自动接着填。</div>';
    h += '<div class="mat-sec-title">人设卡 <span class="tag">1 题</span></div>';
    h += qCard('A');
    h += '<div class="mat-sec-title">核心经历卡 <span class="tag">5 题 · 必填</span></div>';
    QUESTIONS.filter(q => q.group === 'core').forEach(q => { h += qCard(q.id); });
    h += '<div class="mat-sec-title">扩展补缺卡 <span class="tag">4 题 · 选填（想覆盖偏题就填）</span></div>';
    QUESTIONS.filter(q => q.group === 'extra').forEach(q => { h += qCard(q.id); });
    (store.answers.extraMore || []).forEach(x => { h += qCard(x.id, true); });
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2 0-2.8s-2-.8-3 0z"/><path d="M9 11l4 4"/><path d="M13 7l4 4 3-3a2 2 0 0 0-3-3l-4 2z"/><path d="M14 4l6 6"/></svg>生成我的专属素材</button><button class="mat-add" id="matAdd">＋ 添加一段经历</button></div>';
    root.innerHTML = h;
    // 绑定输入
    root.querySelectorAll('textarea[data-q]').forEach(ta => {
      ta.addEventListener('input', () => {
        const id = ta.dataset.q;
        if(id && id[0] === 'X'){ const ex = (store.answers.extraMore || []).find(e => e.id === id); if(ex) ex.text = ta.value; }
        else store.answers[id] = ta.value;
        saveStore();
        updateChar(ta);
      });
      updateChar(ta);
    });
    $('#matGen').onclick = generate;
    $('#matAdd').onclick = () => { (store.answers.extraMore = store.answers.extraMore || []).push({ id:'X' + Date.now(), text:'' }); saveStore(); renderQuestionnaire(root); };
  }

  function qCard(id, isExtraMore){
    const q = QUESTIONS.find(x => x.id === id);
    const title = q ? q.title : '补充经历';
    const hint = q ? q.hint : '补一段真实经历，兜底极端偏题（如交通工具/科学成就）。';
    const val = isExtraMore ? ((store.answers.extraMore || []).find(e => e.id === id) || {}).text || '' : store.answers[id] || '';
    const optCls = (q && q.group === 'extra') || isExtraMore ? ' optional' : '';
    const reqBadge = (q && q.required) ? '<span class="req">必填</span>' : (isExtraMore ? '' : '<span class="opt">选填</span>');
    return '<div class="mat-q' + optCls + '">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(title) + reqBadge + '</span></div>'
      + '<div class="mat-q-hint">' + escapeHtml(hint) + '</div>'
      + '<textarea data-q="' + id + '" placeholder="' + (q ? escapeHtml(q.title) : '真实经历…') + '">' + escapeHtml(val) + '</textarea>'
      + '<div class="mat-char" data-char="' + id + '"></div>'
      + '</div>';
  }
  function updateChar(ta){
    const id = ta.dataset.q;
    const el = document.querySelector('[data-char="' + id + '"]'); if(!el) return;
    const n = ta.value.trim().length;
    el.textContent = '已写 ' + n + ' 字';
    el.classList.toggle('warn', n > 0 && n < 20);
  }

  /* ---------- 生成 ---------- */
  async function generate(extra){
    // 收集经历
    const experiences = [];
    QUESTIONS.forEach(q => { const v = ans(q.id); if(v) experiences.push({ id:q.id, title:q.title, raw:v }); });
    (store.answers.extraMore || []).forEach(x => { if((x.text || '').trim()) experiences.push({ id:x.id, title:'补充经历', raw:x.text.trim() }); });
    (store.answers.followups || []).forEach(f => { if((f.a || '').trim()) experiences.push({ id:'F' + experiences.length, title:f.q || '补充', raw:f.a.trim() }); });
    (store.answers.gaps || []).forEach(g => { if((g.a || '').trim()) experiences.push({ id:'G' + experiences.length, title:g.topic + '（追问补充）', raw:g.a.trim() }); });
    // 校验：A + B1~B5 必填
    const missing = [];
    if(!ans('A')) missing.push('A（自我介绍）');
    QUESTIONS.filter(q => q.group === 'core').forEach(q => { if(!ans(q.id)) missing.push(q.id); });
    if(missing.length){ toast('请先填完必填项：' + missing.join('、')); return; }

    const hasKey = !!(DATA.settings && DATA.settings.relayToken);
    if(!hasKey) toast('未配置 AI Key（设置里填 DeepSeek Key），将用模板兜底生成（质量降级但可用）');

    setLoading('正在把你的故事整合成万能素材…');
    try{
      // 1) 人设
      let persona = null;
      try{ persona = await genPersona(ans('A')); }catch(e){ persona = fallbackPersona(ans('A')); }
      // 2) 整批生成小故事 + AI 追问
      let result = { stories:[], followups:[] };
      try{ result = await genMaterialsBatch(experiences, ans('A')); }
      catch(e){ result = { stories: fallbackMaterialsBatch(experiences), followups:[] }; }
      if(!result.stories || !result.stories.length) result = { stories: fallbackMaterialsBatch(experiences), followups:[] };
      // 3) 缺口
      const covered = unique((result.stories || []).flatMap(m => (m.coverage || []).map(c => c.topic)));
      let gaps = [];
      try{ gaps = await genGaps(covered); }catch(e){ gaps = fallbackGaps(covered); }

      store.persona = persona; store.materials = result.stories; store.followups = result.followups || []; store.gaps = gaps;
      // 给每张素材卡补稳定 id（AI 未必返回），供删除墓碑与跨设备去重使用
      store.materials.forEach(m => { if(m && m.id == null) m.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); });
      store.materialsEpoch = Date.now();   // 生成批次戳：云端合并时凭此整体替换旧素材，避免旧卡片被并集回残留
      saveStore();
      mode = 'result';
      render();
    }catch(e){
      toast('生成中断：' + e.message);
      render();
    }
  }

  function setLoading(msg){
    const root = $('#matRoot'); if(!root) return;
    root.innerHTML = '<div class="mat-loading"><div class="mat-spinner"></div>' + escapeHtml(msg) + '</div>';
  }

  async function genMaterialsBatch(exps, personaText){
    const expText = exps.map(e => '【' + e.title + '】\n' + e.raw).join('\n\n');
    const user = '人设：' + (personaText || '（未提供）') + '\n\n全部经历（含追问补充）：\n' + expText + '\n\n请按规则整合为几个完整核心小故事，并判断是否需要追问补充，输出 stories + followups JSON。';
    const content = await callRelay('material', [ { role:'system', content:SYS_MAT }, { role:'user', content:user } ], 0.7);
    const j = aiJson(content);
    if(!j || !Array.isArray(j.stories)) throw new Error('素材 JSON 解析失败');
    return { stories: j.stories.map((s, i) => normalizeMaterial(s, i)), followups: Array.isArray(j.followups) ? j.followups.map(String) : [] };
  }
  async function genPersona(text){
    const content = await callRelay('material_persona', [ { role:'system', content:SYS_PERSONA }, { role:'user', content:'自我介绍：' + text } ], 0.4);
    const j = aiJson(content);
    if(!j || !j.persona) throw new Error('人设 JSON 解析失败');
    return j.persona;
  }
  async function genGaps(covered){
    const coveredStr = covered.length ? covered.join('、') : '（无）';
    const user = '已被素材自然覆盖的 P2 题族：' + coveredStr + '。\n常见 IELTS P2 题族清单：' + CANON.join('、') + '。\n请列出未被覆盖、且该用户大概率会考到的题族。';
    const content = await callRelay('material_gap', [ { role:'system', content:SYS_GAP }, { role:'user', content:user } ], 0.5);
    const j = aiJson(content);
    let arr = Array.isArray(j) ? j : (j && Array.isArray(j.gaps) ? j.gaps : null);
    if(!arr) throw new Error('缺口 JSON 解析失败');
    return arr.filter(g => g && g.topic).map(g => ({ topic:String(g.topic), question:String(g.question || g.advice || '你有没有和"' + g.topic + '"相关的真实经历？简单说几句。') }));
  }

  function normalizeMaterial(s, i){
    const cov = Array.isArray(s.coverage) ? s.coverage : [];
    return {
      id: s.id || ('m' + Date.now() + '_' + i),
      title: s.title || ('故事' + (i + 1)),
      storyEn: s.storyEn || '',
      logicZh: s.logicZh || '',
      coverage: cov.map(c => ({ topic:String(c.topic || ''), fit:String(c.fit || 'natural'), note:String(c.note || '') })).filter(c => c.topic),
      confidence: s.confidence || 'high'
    };
  }
  function fallbackMaterialsBatch(exps){
    return exps.map((e, i) => ({
      id:'m' + Date.now() + '_' + i, title:e.title || ('故事' + (i + 1)),
      storyEn:'', logicZh:e.raw || '（未填写）',
      coverage:[], confidence:'low', _fallback:true
    }));
  }
  function fallbackPersona(text){
    return { city:'', identity:text || '', values:[], traits:[], _fallback:true };
  }
  function fallbackGaps(covered){
    return CANON.filter(t => !covered.includes(t)).slice(0, 6).map(t => ({ topic:t, question:'你有没有和"' + t + '"相关的真实经历？简单说几句。' }));
  }
  function unique(a){ return Array.from(new Set(a)); }

  /* ---------- 结果页 ---------- */
  function renderResults(root){
    let h = '';
    // 人设卡
    if(store.persona){
      const p = store.persona;
      const tags = [].concat((p.values || []).map(v => '<span class="pp-tag">' + escapeHtml(v) + '</span>'), (p.traits || []).map(t => '<span class="pp-tag">' + escapeHtml(t) + '</span>'));
      h += '<div class="mat-persona"><h3>人设锚点</h3>'
        + '<div class="pp-line">' + (p.city ? escapeHtml(p.city) + ' · ' : '') + escapeHtml(p.identity || '（未提取）') + '</div>'
        + (tags.length ? '<div class="pp-tags">' + tags.join('') + '</div>' : '')
        + '</div>';
    }
    // 故事卡
    store.materials.forEach((m, i) => {
      const isEditing = (editing === i);
      h += '<div class="mat-mat' + (isEditing ? ' open' : '') + '" data-i="' + i + '">'
        + '<div class="mat-mat-head" data-toggle="' + i + '"><span class="mat-mat-title">' + escapeHtml(m.title || '未命名') + '</span>'
        + '<span class="mat-caret">▶</span></div>'
        + '<div class="mat-body">';
      if(isEditing){
        h += '<div class="mat-sub">标题</div><input class="mat-edit-input" data-edit-title="' + i + '" value="' + escapeHtml(m.title || '') + '">'
          + (m.storyEn != null ? '<div class="mat-sub">英文可背（连贯小故事）</div><textarea class="mat-edit-input mat-edit-area" data-edit-story="' + i + '" placeholder="英文小故事…">' + escapeHtml(m.storyEn) + '</textarea>' : '')
          + (m.logicZh != null ? '<div class="mat-sub">中文逻辑链</div><textarea class="mat-edit-input mat-edit-area" data-edit-logic="' + i + '" placeholder="中文逻辑…">' + escapeHtml(m.logicZh) + '</textarea>' : '')
          + '<div class="mat-edit-hint">保存后会<b>直接覆盖</b>这张素材，旧内容不再保留。</div>'
          + '<div class="mat-mat-actions"><button class="mat-mini btn-save" data-save="' + i + '">保存</button><button class="mat-mini" data-cancel="' + i + '">取消</button></div>';
      } else {
        h += (m.storyEn ? '<div class="mat-sub">英文可背（连贯小故事）</div><div class="mat-story-en">' + escapeHtml(m.storyEn) + '</div>' : '')
          + (m.logicZh ? '<div class="mat-sub">中文逻辑链</div><div class="mat-logic">' + escapeHtml(m.logicZh) + '</div>' : '')
          + '<div class="mat-mat-actions"><button class="mat-mini" data-regen-all="1">重新生成全部</button><button class="mat-mini danger" data-del="' + i + '">删除</button><button class="mat-mini" data-edit="' + i + '">更改</button></div>';
      }
      h += '</div></div>';
    });
    // AI 追问区（followups + gaps 合并：每个问题带输入框，回答后一起喂给重新生成）
    const hasFups = store.followups && store.followups.length;
    const hasGaps = store.gaps && store.gaps.length;
    if(hasFups || hasGaps){
      h += '<div class="mat-followup"><h3>🤖 AI 追问区</h3><div class="mat-followup-tip">回答下面的问题（能答几个答几个），点「继续生成」后 AI 会基于新回答重新整合素材、补全覆盖。</div>';
      if(hasFups){
        store.followups.forEach((q, i) => {
          h += '<div class="mat-q"><div class="mat-q-head">' + escapeHtml(q) + '</div><textarea data-followup="' + i + '" placeholder="你的回答…">' + escapeHtml((store.answers.followups && store.answers.followups[i] ? store.answers.followups[i].a : '') || '') + '</textarea></div>';
        });
      }
      if(hasGaps){
        store.gaps.forEach((g, i) => {
          const qtext = g.question || '你有没有和"' + g.topic + '"相关的真实经历？';
          h += '<div class="mat-q mat-gap-q"><div class="mat-q-head"><span class="mat-gap-topic">【' + escapeHtml(g.topic) + '】</span>' + escapeHtml(qtext) + '</div><textarea data-gap="' + i + '" placeholder="你的回答…（没有相关经历可留空）">' + escapeHtml((store.answers.gaps && store.answers.gaps[i] ? store.answers.gaps[i].a : '') || '') + '</textarea></div>';
        });
      }
      h += '<button class="btn btn-primary" id="matContinue">继续生成（含补充回答）</button></div>';
    }
    // 行动
    h += '<div class="mat-actions"><a class="btn btn-primary" href="speaking.html">去练口语 →</a><button class="mat-add" id="matRegen">↻ 重新填写 / 生成</button></div>';
    root.innerHTML = h;

    root.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = () => { const card = el.closest('.mat-mat'); card.classList.toggle('open'); };
    });
    root.querySelectorAll('[data-regen-all]').forEach(b => {
      b.onclick = () => { generate(); };
    });
    root.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if(!confirm('删除这张素材卡？')) return;
        const i = +b.dataset.del;
        const m = store.materials[i];
        // 记录删除墓碑：即使云端/另一份仍残留该卡，合并时也会按 id 过滤掉，避免"删了又回来"
        if(m && m.id != null){ store.deletedIds = store.deletedIds || []; if(!store.deletedIds.includes(m.id)) store.deletedIds.push(m.id); }
        store.materials.splice(i, 1);
        saveStore();
        // 删除后立即上传云端，让墓碑随同步传播，避免旧卡从云端合并回来
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
      };
    });
    // 「更改」：进入编辑态
    root.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => { editing = +b.dataset.edit; render(); };
    });
    // 「取消」：丢弃改动，退出编辑态
    root.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => { editing = -1; render(); };
    });
    // 「保存」：把改后的内容直接覆盖原素材（不新增、不保留旧内容）
    root.querySelectorAll('[data-save]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.save;
        const m = store.materials[i];
        if(!m) return;
        const card = b.closest('.mat-mat');
        const titleEl = card.querySelector('[data-edit-title]');
        const storyEl = card.querySelector('[data-edit-story]');
        const logicEl = card.querySelector('[data-edit-logic]');
        // 直接原地覆盖原素材：id 不变，只更新内容；旧内容不再保留
        m.title = (titleEl ? titleEl.value.trim() : '') || m.title || '未命名';
        m.storyEn = storyEl ? storyEl.value : (m.storyEn || '');
        m.logicZh = logicEl ? logicEl.value : (m.logicZh || '');
        m.updatedAt = Date.now();
        editing = -1;
        saveStore();
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
        toast('已保存（覆盖原素材）');
      };
    });
    const mc = $('#matContinue');
    if(mc) mc.onclick = () => {
      const list = [];
      root.querySelectorAll('[data-followup]').forEach(ta => {
        const i = +ta.dataset.followup;
        const q = (store.followups && store.followups[i]) || '';
        list.push({ q: q, a: ta.value.trim() });
      });
      store.answers.followups = list;
      const gapList = [];
      root.querySelectorAll('[data-gap]').forEach(ta => {
        const i = +ta.dataset.gap;
        const g = (store.gaps && store.gaps[i]) || {};
        gapList.push({ topic: g.topic || '', question: g.question || '', a: ta.value.trim() });
      });
      store.answers.gaps = gapList;
      saveStore();
      generate();
    };
    $('#matRegen').onclick = () => { mode = 'q'; render(); };
  }

  /* ---------- 初始化 ---------- */
  ready(() => {
    if(store.materials.length) mode = 'result'; else mode = 'q';
    render();
  });
})();
