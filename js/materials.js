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
    { id:'B1', group:'core', required:true,  title:'一次外出 / 旅行', hint:'去过哪、和谁、印象最深的瞬间（看到什么/做了什么/当时心情）。写真实细节，别写"很开心"空话。' },
    { id:'B2', group:'core', required:true,  title:'一个对你重要的人', hint:'家人或朋友。他/她做过什么让你记住？你们间发生过什么具体的事？' },
    { id:'B3', group:'core', required:true,  title:'一件你学会或克服的事', hint:'一项技能，或一段咬牙坚持/克服困难的经历。最难的是什么？后来怎么变好？' },
    { id:'B4', group:'core', required:true,  title:'一个每天用或离不开的东西 / 日常爱好', hint:'物件（手机/电脑/乐器…）或爱好。它怎么融入生活？为什么离不开？' },
    { id:'B5', group:'core', required:true,  title:'一个在网上看到、改观或感兴趣的内容', hint:'B站/短视频/文章都行。讲了什么？为什么让你改观或感兴趣？' },
    { id:'C1', group:'extra', required:false, title:'一本喜欢的书 / 一部电影 / 一首歌', hint:'采文化消费，覆盖 book/film/song（选填，能讲几个讲几个）。' },
    { id:'C2', group:'extra', required:false, title:'一件常穿或珍藏的衣服 / 珍贵礼物 / 贵的东西', hint:'采物件，覆盖 clothing/gift/expensive（选填）。' },
    { id:'C3', group:'extra', required:false, title:'一条影响过你的规则 / 法律 / 传统习俗', hint:'采规则维度，覆盖 law/rules/tradition/custom（选填）。' },
    { id:'C4', group:'extra', required:false, title:'一次冲突 / 犯错 / 投诉 / 道歉', hint:'采负面经历，覆盖 disagreement/mistake/complaint/apology（选填）。' }
  ];

  const SYS_MAT = '你是雅思口语串题素材教练。用户会给你一段真实生活经历，你要把它变成一个"万能口语锚点"。规则：1.从经历中拆出多切面：person(人)/place(地)/event(事)/object(物)/emotion(情绪)/values(价值观)。只写经历里真实存在的，不编造。2.匹配它能【自然串】的 IELTS Part 2 题——只列真正贴合的 2~5 个，绝不贪心硬套。3.产出英文 keyword 骨架（不是完整稿），让考生场上自己说，避免背诵痕迹。4.给 2~3 个 P3 追问预判（基于人设，保持一致）。输出严格 JSON：{"id":"m1","title":"标题","raw":"用户原话","facets":{"person":"","place":"","event":"","object":"","emotion":"","values":""},"coverage":["题族1","题族2"],"skeleton":{"en":["英文 keyword1","英文 keyword2"],"zh":["中文对照1","中文对照2"]},"p3Hints":["追问预判1","追问预判2"],"confidence":"high"}';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';
  const SYS_GAP = '你是雅思 P2 覆盖分析师。给定已被素材自然覆盖的 P2 题族，以及常见 IELTS P2 题族清单，请列出未被覆盖、且该用户大概率会考到的题族（最多 6 条），每条给一句补救建议（补真实小记忆 或 用 P2 公式现场编）。只列真正缺口，不要编造已覆盖的。输出严格 JSON 数组：[{"topic":"题族","advice":"建议"}]';

  let store = loadStore();
  let mode = 'q';

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.materials = s.materials || []; s.gaps = s.gaps || []; return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){ s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.materials = s.materials || []; s.gaps = s.gaps || []; DATA.materials = s; return s; }
    }catch(_){}
    return { persona:null, materials:[], gaps:[], answers:{ extraMore:[] } };
  }
  function saveStore(){ DATA.materials = store; hubSave(); }
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
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen">🚀 生成我的专属素材</button><button class="mat-add" id="matAdd">＋ 添加一段经历</button></div>';
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
  async function generate(){
    // 收集经历
    const experiences = [];
    QUESTIONS.forEach(q => { const v = ans(q.id); if(v) experiences.push({ id:q.id, title:q.title, raw:v }); });
    (store.answers.extraMore || []).forEach(x => { if((x.text || '').trim()) experiences.push({ id:x.id, title:'补充经历', raw:x.text.trim() }); });
    // 校验：A + B1~B5 必填
    const missing = [];
    if(!ans('A')) missing.push('A（自我介绍）');
    QUESTIONS.filter(q => q.group === 'core').forEach(q => { if(!ans(q.id)) missing.push(q.id); });
    if(missing.length){ toast('请先填完必填项：' + missing.join('、')); return; }

    const hasKey = !!(DATA.settings && DATA.settings.relayToken);
    if(!hasKey) toast('未配置 AI Key（设置里填 DeepSeek Key），将用模板兜底生成（质量降级但可用）');

    setLoading('正在把你的故事变成万能素材…');
    try{
      // 1) 人设
      let persona = null;
      try{ persona = await genPersona(ans('A')); }catch(e){ persona = fallbackPersona(ans('A')); }
      // 2) 逐条素材（顺序生成，稳健抗限流）
      const materials = [];
      for(let i = 0; i < experiences.length; i++){
        setLoading('正在生成第 ' + (i + 1) + ' / ' + experiences.length + ' 条素材…');
        let m = null;
        try{ m = await genMaterial(experiences[i], ans('A')); }catch(e){ m = fallbackMaterial(experiences[i], i); }
        if(m) materials.push(m);
      }
      // 3) 缺口
      const covered = unique(materials.flatMap(m => (m.coverage || [])));
      let gaps = [];
      try{ gaps = await genGaps(covered); }catch(e){ gaps = fallbackGaps(covered); }

      store.persona = persona; store.materials = materials; store.gaps = gaps;
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

  async function genMaterial(exp, personaText){
    const user = '人设：' + (personaText || '（未提供）') + '\n经历标题：' + exp.title + '\n用户原话：' + exp.raw + '\n请按规则生成这条素材的 JSON。';
    const content = await callRelay('material', [ { role:'system', content:SYS_MAT }, { role:'user', content:user } ], 0.8);
    const j = aiJson(content);
    if(!j || typeof j !== 'object') throw new Error('素材 JSON 解析失败');
    return normalizeMaterial(j, exp);
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
    return arr.filter(g => g && g.topic).map(g => ({ topic:String(g.topic), advice:String(g.advice || '补一个真实相关的小记忆，或用 P2 公式现场编。') }));
  }

  function normalizeMaterial(j, exp){
    const facets = j.facets || {};
    const sk = j.skeleton || {};
    return {
      id: j.id || ('m' + Date.now() + Math.floor(Math.random()*1000)),
      title: j.title || (exp.raw || '').slice(0, 20) || exp.title,
      raw: exp.raw,
      facets: { person:facets.person||'', place:facets.place||'', event:facets.event||'', object:facets.object||'', emotion:facets.emotion||'', values:facets.values||'' },
      coverage: Array.isArray(j.coverage) ? j.coverage.map(String) : [],
      skeleton: { en: Array.isArray(sk.en) ? sk.en.map(String) : [], zh: Array.isArray(sk.zh) ? sk.zh.map(String) : [] },
      p3Hints: Array.isArray(j.p3Hints) ? j.p3Hints.map(String) : [],
      confidence: j.confidence || 'high'
    };
  }
  function fallbackMaterial(exp, idx){
    return { id:'m' + Date.now() + '_' + idx, title:(exp.raw || '').slice(0, 20) || exp.title, raw:exp.raw, facets:{}, coverage:[], skeleton:{ en:[ exp.raw || '' ], zh:[] }, p3Hints:[], confidence:'low', _fallback:true };
  }
  function fallbackPersona(text){
    return { city:'', identity:text || '', values:[], traits:[], _fallback:true };
  }
  function fallbackGaps(covered){
    return CANON.filter(t => !covered.includes(t)).slice(0, 6).map(t => ({ topic:t, advice:'补一个真实相关的小记忆（3 句话骨架），或用 P2 公式现场编。' }));
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
    // 素材卡
    store.materials.forEach((m, i) => {
      const facetKeys = [['person','人'],['place','地'],['event','事'],['object','物'],['emotion','情绪'],['values','价值观']];
      const facetHtml = facetKeys.filter(([k]) => m.facets[k]).map(([k,label]) => '<span class="mat-facet f">' + label + '：' + escapeHtml(m.facets[k]) + '</span>').join('');
      const skelHtml = (m.skeleton.en || []).map((en, k) => '<li><span class="en">' + escapeHtml(en) + '</span><span class="zh">' + escapeHtml((m.skeleton.zh || [])[k] || '') + '</span></li>').join('');
      const covHtml = (m.coverage || []).map(c => '<span class="mat-cov-item">' + escapeHtml(c) + '</span>').join('');
      const p3Html = (m.p3Hints || []).map(p => '<div>· ' + escapeHtml(p) + '</div>').join('');
      h += '<div class="mat-mat" data-i="' + i + '">'
        + '<div class="mat-mat-head" data-toggle="' + i + '"><span class="mat-mat-title">' + escapeHtml(m.title || '未命名') + '</span>'
        + '<span class="mat-mat-cov">覆盖 ' + (m.coverage ? m.coverage.length : 0) + ' 题</span><span class="mat-caret">▶</span></div>'
        + '<div class="mat-body">'
        + (facetHtml ? '<div class="mat-facets">' + facetHtml + '</div>' : '')
        + '<div class="mat-sub">英文骨架（keyword，非全文）</div><ul class="mat-skel">' + (skelHtml || '<li><span class="en">（未生成）</span></li>') + '</ul>'
        + '<div class="mat-sub">自然覆盖的 P2 题</div><div class="mat-cov-list">' + (covHtml || '<span class="mat-cov-item">（无）</span>') + '</div>'
        + '<div class="mat-sub">P3 追问预判</div><div class="mat-p3">' + (p3Html || '<div>（无）</div>') + '</div>'
        + '<div class="mat-sub">原话（可改，保存后仅更新文本）</div><textarea class="mat-raw-edit" data-raw="' + i + '">' + escapeHtml(m.raw || '') + '</textarea>'
        + '<div class="mat-mat-actions">'
        + '<button class="mat-mini" data-save="' + i + '">保存原话</button>'
        + '<button class="mat-mini" data-regen="' + i + '">重新生成该条</button>'
        + '<button class="mat-mini danger" data-del="' + i + '">删除</button>'
        + '</div>'
        + '</div></div>';
    });
    // 缺口
    if(store.gaps && store.gaps.length){
      h += '<div class="mat-gaps"><h3>⚠️ 暂未自然覆盖的题（诚实兜底，不硬套）</h3>';
      store.gaps.forEach(g => { h += '<div class="mat-gap"><span class="gt">' + escapeHtml(g.topic) + '</span><span class="ga">' + escapeHtml(g.advice) + '</span></div>'; });
      h += '</div>';
    }
    // 行动
    h += '<div class="mat-actions"><a class="btn btn-primary" href="speaking.html">去练口语 →</a><button class="mat-add" id="matRegen">↻ 重新填写 / 生成</button></div>';
    root.innerHTML = h;

    root.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = () => { const card = el.closest('.mat-mat'); card.classList.toggle('open'); };
    });
    root.querySelectorAll('[data-save]').forEach(b => {
      b.onclick = () => { const i = +b.dataset.save; const ta = root.querySelector('[data-raw="' + i + '"]'); if(ta) store.materials[i].raw = ta.value.trim(); saveStore(); toast('已保存原话'); };
    });
    root.querySelectorAll('[data-regen]').forEach(b => {
      b.onclick = async () => { const i = +b.dataset.regen; const m = store.materials[i]; if(!m) return; b.textContent = '生成中…'; b.disabled = true;
        try{ const nm = await genMaterial({ id:m.id, title:m.title, raw:m.raw }, ans('A') || (store.persona && store.persona.identity) || ''); store.materials[i] = nm; saveStore(); render(); }
        catch(e){ const fm = fallbackMaterial({ raw:m.raw }, i); store.materials[i] = fm; saveStore(); render(); }
      };
    });
    root.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => { const i = +b.dataset.del; store.materials.splice(i, 1); saveStore(); render(); };
    });
    $('#matRegen').onclick = () => { mode = 'q'; render(); };
  }

  /* ---------- 初始化 ---------- */
  ready(() => {
    if(store.materials.length) mode = 'result'; else mode = 'q';
    render();
  });
})();
