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
    { id:'B1', group:'core', required:true,  title:'一次你和某个重要的人一起做的事 / 外出', hint:'写全：和谁 / 什么时候 / 去哪 / 具体做了什么 / 一个当时看到的细节 / 当时感受。例：去年八月和男友去厦门，鼓浪屿沙滩边吃现做的海蛎煎，晚上海边散步看对岸灯火，觉得很踏实。' },
    { id:'B2', group:'core', required:true,  title:'一件你学会 / 克服 / 坚持的事', hint:'写全：学什么 / 难在哪 / 怎么熬过来的 / 现在做得怎样 / 感受。例：备考雅思练口语，一开始开口就卡，每天用 AI 对话半小时，两个月后能说满 2 分钟，很有成就感。' },
    { id:'B3', group:'core', required:true,  title:'一个每天用或离不开的东西 / 日常爱好', hint:'写全：是什么 / 什么时候开始用 / 每天怎么用 / 一个具体场景 / 为什么离不开。例：笔记本电脑，学代码写作业全靠它，每天背单词软件刷 20 分钟，屏幕边贴着便利贴。' },
    { id:'B4', group:'core', required:true,  title:'一个在网上看到、让你改观或感兴趣的内容', hint:'写全：在哪看到 / 讲了什么 / 一个具体画面或细节 / 为什么打动你。例：B站看UP主讲间隔背单词法，照做两周记住了一直忘的词，才发现方法比硬背重要。' },
    { id:'B5', group:'core', required:true,  title:'一个对你重要的地方 / 一次印象深的经历', hint:'写全：什么地方 / 什么时候去或常去 / 在那做什么 / 一个细节 / 为什么重要。例：外婆家的老院子，夏天在葡萄架下写作业，她摇着蒲扇讲故事，现在想起来很安心。' },
    { id:'C1', group:'extra', required:false, title:'一本喜欢的书 / 一部电影', hint:'写全：名字 / 讲什么 / 印象最深的画面 / 感受（选填，当季相关：包含动物的故事或书 / 最不喜欢的电影）。' },
    { id:'C2', group:'extra', required:false, title:'一件想攒钱买的物品 / 常用的电子产品', hint:'写全：是什么 / 大概多少钱 / 为什么想要 / 买来做什么（选填，当季相关：攒钱买想要物品 / 电子设备）。' },
    { id:'C3', group:'extra', required:false, title:'一条你知道 / 想颁布的规则或法律', hint:'写全：内容 / 从哪知道 / 你怎么看 / 对生活的影响（选填，当季相关：想颁布的新法律 / 保护环境的法律）。' },
    { id:'C4', group:'extra', required:false, title:'一次遇到麻烦 / 改变主意的经历', hint:'写全：出了什么事 / 怎么应对 / 结果 / 感受（选填，当季相关：遇到的科技问题 / 近期改变的计划）。' }
  ];

  const SYS_MAT = '你是雅思口语串题素材教练。考生会给你一份人设 + 若干段真实生活经历（含可能来自你上一轮追问的补充回答）。\n'
  + '你的任务：把全部经历整合成**数量尽量少的连贯故事**——**首要目标是 1 个完整大故事**：用自然的过渡（时间线/因果线，如「那次去厦门的路上…同行的朋友…」）把旅行、人物、物品、见闻、感受全部串成一条叙事线，而不是切成几个互不相干的小片段；只有当某段经历确实无法自然衔接进主线时才允许拆出第 2 个故事（最多 2~3 个，严禁凑数、严禁按题族切分）。**必须把考生填入的每一段经历的关键事实完整纳入最终故事，不得遗漏。** 故事要让考生直接背出来，且**背诵量最小化**：考生最终只需要背 storyEn + 每题一句 bridgeEn 点题句，不要产出多套需要分别背诵的平行故事。\n'
  + '规则：\n'
  + '1. 故事必须基于考生原话，真实不编造。**事实完整性优先于语言精简**：若把相关经历合并成一个故事，两段经历的关键事实（人物/地点/事件/感受）都必须出现在某个 storyEn 或 logicZh 里——信息不能丢，但语言允许压缩重写；宁可多生成一个小故事，也绝不丢弃考生填的事实。\n'
  + '2. 每个故事含：title(标题) / storyEn(一段英文小故事，**90~120 词**——按考生口语水平校准，句子可简单但必须能背；用**基础词汇**、短到中等长度的句子，靠 and / so / because / but / actually 等连接词串成有「起因→经过→感受→结尾」的**连贯叙事**，读起来像在讲一件事而不是清单；严禁连续堆砌孤立短句、严禁连续同一主语/同一动词；**严禁超过 120 词**，宁可用两个短故事承载也不写超长故事) / logicZh(中文**逻辑链**：用若干中文短语以 "—"（中文横杠/破折号）串接，把故事的关键步骤、转折、感受、细节都铺开——越长越细越好、数量不固定，例如"朋友送手机壳—觉得很有心—每天用手机—看到就想起朋友—珍藏") / coverage(能套的当季 P2 题数组)。\n'
  + '3. 人设一致：每个故事至少一处与考生人设（性格/价值观）自然呼应（如「理性」「喜欢无纸化学习」这类考生自己的特质），为 Part 3 追问时的人设一致性打底，不要让故事像另一个人经历。\n'
  + '4. coverage 每个元素：{"topic":"题名","fit":"natural|loose","bridgeEn":"1 句英文点题句","note":"中文一句怎么套(如\'旅行中意识到环保法重要→套法律法规\';natural 可简写)"}。topic 必须**逐字取自下方【P2 题库对照清单】里的题目名**（这是考生网站当季真实题库），严禁自创题族名、严禁使用清单外的名字。bridgeEn 是把本故事嫁接到该题、考场可直接念的**英文简单句**（只用初中词汇、单一主谓结构，15 词以内）。\n'
  + '4.1 覆盖宁多勿漏（重要）：每个故事的 coverage 要把下方清单**全量扫一遍**。评估标准 = **考场可嫁接性**，不是字面包含——直接讲的是 natural；只要故事提供一个场景/时机、考场上能自然补一句合理小细节圆上的就是 loose。**场景型故事（旅行/学校/家庭聚会/常去的地方）是万能辐射源**：该场景里合理出现的一切（建筑、看过的比赛、吃过的食物、遇到的人、拥挤嘈杂、拍的照片…）都可挂。例：去厦门旅行的故事 →「喜欢或不喜欢的高建筑」loose（住的酒店楼层很高）、「喜欢的现场体育赛事」loose（沙滩上正好有排球赛）。每张卡通常能列 10~20 题，**宁可多挂不可漏挂**（考场上不合适可现场放弃，漏挂则考生根本不知道能套）。\n'
  + '4.2 **抽象/观点类题同样可挂（重要）**：想颁布的法律、规则、想做的改变、想解决的问题、想引入的传统、挑战/冒险、认为重要的事这类**表达观点的抽象题**，不要求故事里真的发生过——任何故事都能通过一句过渡句嫁接。公式：故事见闻/感受 → 引出观点（I saw …, so I think … / I want to …）。例：去厦门旅行的故事 →「想颁布的法律」loose（路上看到有人破坏环境，所以想颁布保护环境的法律）。凡是故事见闻能自然引出一个想法/愿望/评价的抽象题，都应列入 coverage（loose），note 写清那句过渡怎么讲。\n'
  + '4.3 **通用性优先（合并时的取舍标准）**：合并故事时，尽量让最终的大故事同时含有**「人物（同行的朋友/帮助过你的人）+ 地点（城市/场所）+ 物品/食物 + 事件（比赛/购物/意外）+ 见闻与感受（可引出观点的瞬间）」五类元素**——这样一个故事本身就是万能辐射源，里面每个人、地点、物品、见闻都能独立辐射一批题。若某段经历能自然嵌进主线增加元素，就嵌进去（哪怕只是半句带过）；不要为了「故事主题纯粹」而把能合并的经历拆出去。'
  + '5. 不要产出 keyword 骨架 / 不要拆分多切面列表——考生基础弱，给词也不会说句型，必须给**成段的、能直接背的英文小故事**（句子可简单但必须连贯，靠连接词串成一件事）。\n'
  + '6. 自检（输出前必须执行）：把下方题库清单逐题过一遍——每题要么已被某故事的 coverage 覆盖，要么确认现有素材实在覆盖不了，放入 uncovered 数组（topic 逐字取自清单，reason 写明缺什么素材，如"缺地点类经历"）。\n'
  + '7. followups：针对 uncovered 里「补 1-2 问就能救」的题，生成第二人称、具体好答的澄清性问题（如"你最近半年有没有搬过家？搬去哪了？"）；若素材已够广，followups 返回空数组。\n'
  + '【P2 题库对照清单】\n{BANK_P2_LIST}\n'
  + '输出严格 JSON：{"stories":[{"title":"","storyEn":"","logicZh":"","coverage":[{"topic":"","fit":"","bridgeEn":"","note":""}]}],"uncovered":[{"topic":"","reason":""}],"followups":["还想了解的问题1","问题2"]}，不要任何解释文字。';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';
  const SYS_GAP = '你是雅思 P2 覆盖分析师。给定已被素材（含搭边串题）覆盖的 P2 题族，以及考生当季真实 P2 题库清单，请列出**连搭边都难覆盖**、且该用户大概率会考到的题族（最多 6 条），每条给一个**澄清性问题**——用第二人称直接问考生真实经历，问题要具体、好回答，比如"你最近半年有没有搬过家？搬去哪了？"、"你有没有哪款小工具是每天都用的？说说怎么用的？"。只列真正缺口，不要编造已覆盖的。输出严格 JSON 数组：[{"topic":"题族","question":"澄清性问题"}]';

  /* === 当季 P2 题库动态提取（P0：替代写死的 CANON 旧季快照）===
     每次生成/追问都以 DATA.speaking 真实题库为准（换季后自动跟随）；
     题库缺失时才回退 CANON 静态表（离线/异常兜底）。 */
  function getBankP2List(){
    const arr = (DATA.speaking || []).filter(s => s && s.type === 'P2');
    if(!arr.length) return null;
    return arr.map(s => ({
      title: s.titleZh || s.titleEn || '',
      req: (s.youShouldSay || []).slice(0, 3).join('；')
    })).filter(b => b.title);
  }
  function buildSysMat(){
    const bank = getBankP2List();
    const listStr = bank
      ? bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n')
      : CANON.join('、');
    return SYS_MAT.replace('{BANK_P2_LIST}', listStr);
  }

  let store = loadStore();
  let mode = 'q';
  let editing = -1;   // 当前正在「更改」编辑的素材卡下标；-1 表示无
  let shortWarned = false;   // P2：质检软门槛——短答案警告只弹一次，之后点生成直接放行

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.uncovered = s.uncovered || []; s.deletedIds = s.deletedIds || []; return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){ s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.deletedIds = s.deletedIds || []; DATA.materials = s; return s; }
    }catch(_){}
    return { persona:null, materials:[], gaps:[], followups:[], uncovered:[], answers:{ extraMore:[], followups:[], gaps:[] } };
  }
  function saveStore(){
    // epoch 必须打在「即将写入的 store」上（与口语页旧内嵌版对齐的修复）：
    // 新用户首次 loadStore() 返回尚未挂到 DATA.materials 的新对象，若把 epoch 打在
    // DATA.materials 上再整体替换，首次保存的素材没有 epoch → 云端合并不走
    // 「较新端整体替换」分支，会出现「删了又并回来」。
    if(store && typeof store === 'object') store.materialsEpoch = Date.now();
    DATA.materials = store; hubSave();
  }
  function ans(id){ return (store.answers[id] || '').trim(); }

  /* 渲染容器双适配：materials.html 用 #matRoot；口语页 MAT tab 用 #matView */
  function rootEl(){ return $('#matRoot') || $('#matView'); }
  function init(){
    store = loadStore();
    mode = store.materials.length ? 'result' : 'q';
    render();
  }

  /* ---------- 渲染分发 ---------- */
  function render(){
    const root = rootEl(); if(!root) return;
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
    let tip = '已写 ' + n + ' 字';
    let cls = '';
    if(n > 0 && n < 20){ tip += ' · 太短，AI 没细节可用'; cls = 'warn'; }
    else if(n >= 20 && n < 60){ tip += ' · 再补 1-2 个细节（看到什么 / 当时感受）'; cls = 'ok'; }
    else if(n >= 60){ tip += ' · 够了'; cls = 'good'; }
    el.textContent = tip;
    el.classList.remove('warn','ok','good');
    if(cls) el.classList.add(cls);
  }

  /* ---------- 生成 ---------- */
  async function generate(extra){
    editing = -1;   // 重新生成整体替换素材集，重置编辑态，避免旧下标错位指向错误的卡（f 类：跨操作状态隔离）
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

    // P2：素材质检软门槛——核心经历太短先提示补充（不强制拦截，可点「直接生成」放行）
    const shortOnes = QUESTIONS.filter(q => q.group === 'core' && ans(q.id) && ans(q.id).length < 40).map(q => q.id);
    if(shortOnes.length && !shortWarned){
      shortWarned = true;
      showShortWarning(shortOnes);
      return;
    }

    const hasKey = !!(DATA.settings && DATA.settings.relayToken);
    if(!hasKey) toast('未配置 AI Key（设置里填 DeepSeek Key），将用模板兜底生成（质量降级但可用）');

    setLoading('正在把你的故事整合成万能素材…');
    try{
      // 1) 人设
      let persona = null;
      try{ persona = await genPersona(ans('A')); }catch(e){ persona = fallbackPersona(ans('A')); }
      // 2) 整批生成小故事 + AI 追问
      let result = { stories:[], uncovered:[], followups:[] };
      try{ result = await genMaterialsBatch(experiences, ans('A')); }
      catch(e){ result = { stories: fallbackMaterialsBatch(experiences), uncovered:[], followups:[] }; }
      if(!result.stories || !result.stories.length) result = { stories: fallbackMaterialsBatch(experiences), uncovered:[], followups:[] };
      // 3) 缺口（喂入 AI 自检的 uncovered，让缺口分析有的放矢）
      const covered = unique((result.stories || []).flatMap(m => (m.coverage || []).map(c => c.topic)));
      let gaps = [];
      try{ gaps = await genGaps(covered, result.uncovered || []); }catch(e){ gaps = fallbackGaps(covered); }

      // P0：保留用户手改（updatedAt）或置顶（pinned）的素材卡——AI 只重生成其余部分，
      // 杜绝「继续生成/重新生成」把用户改好的故事整批冲掉（数据丢失级缺陷）。
      const keepOld = (store.materials || []).filter(m => m && (m.updatedAt || m.pinned));
      store.persona = persona; store.materials = keepOld.concat(result.stories); store.followups = result.followups || []; store.gaps = gaps; store.uncovered = result.uncovered || [];
      store.bankVersion = DATA.speakingVersion;   // P2：记录生成时题库版本，换季后据此提示重映射
      // 给每张素材卡补稳定 id（AI 未必返回），供删除墓碑与跨设备去重使用
      store.materials.forEach(m => { if(m && m.id == null) m.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); });
      store.materialsEpoch = Date.now();   // 生成批次戳：云端合并时凭此整体替换旧素材，避免旧卡片被并集回残留
      saveStore();
      mode = 'result';
      render();
      if(keepOld.length) toast('已保留你置顶/手改过的 ' + keepOld.length + ' 张素材卡');
    }catch(e){
      toast('生成中断：' + e.message);
      render();
    }
  }

  function setLoading(msg){
    const root = rootEl(); if(!root) return;
    root.innerHTML = '<div class="mat-loading"><div class="mat-spinner"></div>' + escapeHtml(msg) + '</div>';
  }

  /* P2：质检软门槛提示——列出偏短的核心经历，给「直接生成」放行按钮 */
  function showShortWarning(ids){
    const root = rootEl(); if(!root) return;
    const old = document.querySelector('.mat-shortwarn'); if(old) old.remove();
    const names = ids.map(id => (QUESTIONS.find(q => q.id === id) || {}).title || id);
    const div = document.createElement('div');
    div.className = 'mat-shortwarn';
    div.innerHTML = '<b>先补两个细节？</b>这几段经历偏短（不到 40 字），AI 只能干巴巴地拼，故事会不像真的：'
      + '<div class="mat-shortwarn-list">' + names.map(n => '· ' + escapeHtml(n)).join('<br>') + '</div>'
      + '<div class="mat-shortwarn-actions"><button class="btn btn-primary" id="matShortGen">直接生成</button><span class="mat-shortwarn-tip">建议回上面补 1-2 个细节（看到什么 / 当时感受）再生成</span></div>';
    root.prepend(div);
    div.scrollIntoView({ behavior:'smooth', block:'center' });
    document.getElementById('matShortGen').onclick = () => { div.remove(); generate(); };
  }

  async function genMaterialsBatch(exps, personaText){
    const expText = exps.map(e => '【' + e.title + '】\n' + e.raw).join('\n\n');
    const user = '人设：' + (personaText || '（未提供）') + '\n\n全部经历（含追问补充）：\n' + expText + '\n\n请按规则整合为几个完整核心小故事，并判断是否需要追问补充，输出 stories + followups JSON。';
    const content = await callRelay('material', [ { role:'system', content:buildSysMat() }, { role:'user', content:user } ], 0.7);
    const j = aiJson(content);
    if(!j || !Array.isArray(j.stories)) throw new Error('素材 JSON 解析失败');
    return {
      stories: j.stories.map((s, i) => normalizeMaterial(s, i)),
      uncovered: Array.isArray(j.uncovered) ? j.uncovered.filter(u => u && u.topic).map(u => ({ topic:String(u.topic), reason:String(u.reason || '') })) : [],
      followups: Array.isArray(j.followups) ? j.followups.map(String) : []
    };
  }
  async function genPersona(text){
    const content = await callRelay('material_persona', [ { role:'system', content:SYS_PERSONA }, { role:'user', content:'自我介绍：' + text } ], 0.4);
    const j = aiJson(content);
    if(!j || !j.persona) throw new Error('人设 JSON 解析失败');
    return j.persona;
  }
  async function genGaps(covered, uncovered){
    const coveredStr = covered.length ? covered.join('、') : '（无）';
    const uncStr = (uncovered && uncovered.length) ? uncovered.map(u => u.topic + (u.reason ? '（缺：' + u.reason + '）' : '')).join('、') : '（无）';
    const bank = getBankP2List();
    const listStr = bank ? bank.map(b => b.title).join('、') : CANON.join('、');
    const user = '已被素材自然覆盖的 P2 题族：' + coveredStr + '。\nAI 自检确认现有素材覆盖不了的题：' + uncStr + '。\n考生当季真实 P2 题库清单：' + listStr + '。\n请只针对仍缺素材的题列澄清性问题。';
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
      coverage: cov.map(c => ({ topic:String(c.topic || ''), fit:String(c.fit || 'natural'), bridgeEn:String(c.bridgeEn || ''), note:String(c.note || '') })).filter(c => c.topic),
      confidence: s.confidence || 'high',
      pinned: false
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

  /* === 当季覆盖矩阵（P1）：按题库分类分行展示每道 P2 题的覆盖状态 ===
     teal 实底 = 自然贴合（natural）；teal 描边 = 搭边（loose）；灰 = 暂无素材。
     纯信息展示（不做成小可点目标，遵守 ≥44px 命中区红线），练题入口给一个大按钮。 */
  function renderCoverageMatrix(){
    const bank = (DATA.speaking || []).filter(s => s && s.type === 'P2');
    if(!bank.length) return '';
    const covMap = new Map();
    (store.materials || []).forEach(m => (m.coverage || []).forEach(c => {
      if(!c || !c.topic) return;
      const prev = covMap.get(c.topic);
      if(prev !== 'natural' && (!prev || c.fit === 'natural')) covMap.set(c.topic, c.fit === 'natural' ? 'natural' : 'loose');
    }));
    const titleOf = s => s.titleZh || s.titleEn || '';
    const fitOf = s => covMap.get(titleOf(s)) || 'none';
    const natural = bank.filter(s => fitOf(s) === 'natural').length;
    const loose = bank.filter(s => fitOf(s) === 'loose').length;
    // 按题库分类分组（保持题库原序）
    const groups = [];
    bank.forEach(s => {
      const cat = s.category || '其他';
      let g = groups.find(x => x.cat === cat);
      if(!g){ g = { cat: cat, items: [] }; groups.push(g); }
      g.items.push(s);
    });
    const missingCnt = bank.length - natural - loose;
    let h = '<div class="mat-matrix"><div class="mat-mx-head"><h3>当季覆盖 ' + (natural + loose) + '/' + bank.length + ' 题</h3>'
      + '<span class="mat-mx-stat">自然贴合 ' + natural + ' · 搭边 ' + loose + ' · 缺素材 ' + missingCnt + '</span></div>';
    groups.forEach(g => {
      h += '<div class="mat-mx-row"><span class="mat-mx-cat">' + escapeHtml(g.cat) + '</span><div class="mat-mx-chips">'
        + g.items.map(s => '<span class="mat-chip mat-chip-' + fitOf(s) + '">' + escapeHtml(titleOf(s)) + '</span>').join('')
        + '</div></div>';
    });
    h += '<div class="mat-mx-legend"><span class="mat-chip mat-chip-natural">自然贴合</span><span class="mat-chip mat-chip-loose">搭边可套</span><span class="mat-chip mat-chip-none">缺素材</span></div>'
      + '<div class="mat-mx-actions">'
      + '<button class="btn mat-mx-dig" id="matDig" title="AI 拿每张素材卡对新题库全量重评：搭边就列、宁多勿漏">深挖覆盖</button>'
      + (missingCnt ? '<button class="btn mat-mx-dig" id="matAsk" title="AI 会把缺题聚类，用最少几个追问问出高覆盖经历（一问挂多题），答完继续生成即可补上">补齐缺题（还差 ' + missingCnt + ' 题）</button>' : '')
      + '<a class="btn btn-primary mat-mx-go" href="speaking.html">去口语页练题 →</a></div>'
      + '<div class="mat-mx-tip">灰色题 = 缺素材：点「补齐缺题」让 AI 针对性追问，答几条算几条，「继续生成」后即可补上。</div></div>';
    return h;
  }

  /* === 补齐缺题：拿矩阵里的灰色缺题清单，让 AI 逐题出澄清性问题（存入追问区） ===
     用户回答后走已有「继续生成」链路（gap 回答会作为经历喂给重新生成），把缺题补上。 */
  function getMissingTopics(){
    const bank = (DATA.speaking || []).filter(s => s && s.type === 'P2');
    const covMap = new Map();
    (store.materials || []).forEach(m => (m.coverage || []).forEach(c => {
      if(!c || !c.topic) return;
      const prev = covMap.get(c.topic);
      if(prev !== 'natural' && (!prev || c.fit === 'natural')) covMap.set(c.topic, c.fit === 'natural' ? 'natural' : 'loose');
    }));
    return bank.filter(s => !covMap.get(s.titleZh || s.titleEn || '')).map(s => s.titleZh || s.titleEn || '');
  }

  async function askMissingTopics(){
    const missing = getMissingTopics();
    if(!missing.length){ toast('没有缺题，当季已全部覆盖'); return; }
    const btn = $('#matAsk');
    if(btn){ btn.disabled = true; btn.textContent = '正在出追问…'; }
    try{
      const storyInfo = (store.materials || []).filter(Boolean).map(m => '【' + (m.title || '') + '】' + String(m.storyEn || '').slice(0, 120)).join('\n');
      // 追问也要"串题"：绝不一一对应，且一个追问只开一个话题（挂靠靠生成环节的搭边实现，不靠问句堆叠）
      const sys = '你是雅思口语串题补缺教练。考生的万能故事覆盖不了下面这些当季 P2 题。你的任务：用**最少**的追问（通常 3~6 个，最多不超过 8 个）引出几段「高覆盖」的真实经历：\n'
        + '1. **每个追问只许问一件事**：一个单一的开放式话题邀请，一两句话问完。**严禁连环多问**——出现"另外 / 还有 / 顺便 / 如果让你…"接出第二件独立的事即违规；也严禁把多个缺题的问句拼接在一个追问里。\n'
        + '2. 一问挂多题靠**话题的延展性**实现，不靠问句堆叠：选一个能辐射一堆缺题的经历话题，追问里用括号提示叙述维度即可（如「讲一段你和最要好的朋友相处的回忆（怎么认识的、一起做过印象最深的一件事、你什么感受）」——这一段经历生成故事后，人物类/事件类/夜晚类缺题会在生成时自动搭边挂上）。\n'
        + '3. 每个追问的 topics 数组列出它预期辐射的缺题（逐字取自缺题清单，一问通常 4~8 题）。\n'
        + '4. 只问缺题相关的内容；已有故事覆盖的不要问。\n'
        + '输出严格 JSON 数组：[{"topics":["缺题1","缺题2"],"question":"单一话题追问"}]，不要任何解释文字。';
      const user = '已有故事概要（不要重复问这些）：\n' + (storyInfo || '（无）') + '\n\n未覆盖的当季题（共 ' + missing.length + ' 题）：\n' + missing.join('\n');
      const content = await callRelay('material_ask_missing', [ { role:'system', content:sys }, { role:'user', content:user } ], 0.6);
      const j = aiJson(content);
      const arr = Array.isArray(j) ? j : (j && Array.isArray(j.gaps) ? j.gaps : null);
      if(!arr) throw new Error('追问 JSON 解析失败');
      // 兼容 topics 数组（一问挂多题）与旧 topic 单值
      store.gaps = arr.filter(g => g && (Array.isArray(g.topics) ? g.topics.length : g.topic)).map(g => ({
        topic: Array.isArray(g.topics) ? g.topics.map(String).join('、') : String(g.topic || ''),
        question: String(g.question || '')
      }));
      // 清空旧追问区（补齐缺题的追问是最新一轮）：
      // 已输入未保存的旧追问回答先存档到 answers.followups，防丢字
      const rootNow = rootEl();
      if(rootNow){
        const typed = [];
        rootNow.querySelectorAll('[data-followup]').forEach(ta => {
          const i = +ta.dataset.followup;
          const q = (store.followups && store.followups[i]) || '';
          if(ta.value.trim()) typed.push({ q: q, a: ta.value.trim() });
        });
        if(typed.length) store.answers.followups = (store.answers.followups || []).concat(typed);
      }
      store.followups = [];
      saveStore();
      render();
      toast('已生成 ' + store.gaps.length + ' 个高覆盖追问（一问挂多题，旧追问已刷新）：作答后点「继续生成」');
    }catch(e){
      render();
      toast('追问生成失败：' + e.message);
    }
  }

  /* === 换季重映射（P2）：题库换季后，把每张素材卡的 coverage 一次性对齐新题库 ===
     旧题在新库没有对应题 → 丢弃该条；能对应 → AI 重给 fit + bridgeEn + note。
     失败不破坏现有数据（只在成功后整体写回）。 */
  async function remapCoverage(){
    // 两个入口共用：换季横幅的「一键深挖覆盖」+ 矩阵常驻的「深挖覆盖」
    [ $('#matRemap'), $('#matDig') ].forEach(b => { if(b){ b.disabled = true; b.textContent = '正在深挖…'; } });
    try{
      const bank = getBankP2List();
      const mats = (store.materials || []).filter(m => m && (m.coverage || []).length);
      if(!bank || !mats.length) throw new Error('没有可映射的素材');
      const newList = bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n');
      // 深挖式重映射：不只翻译旧对照，而是每张卡对着新题库【全量重评】——考场可嫁接标准
      const storyInfo = mats.map(m => '【' + (m.title || '未命名') + '】\n故事概要：' + String(m.storyEn || '').slice(0, 400) + '\n中文逻辑：' + (m.logicZh || '') + '\n旧对照（仅供参考，可推翻）：' + m.coverage.map(c => c.topic).join('、')).join('\n\n');
      const rawAns = QUESTIONS.map(q => ans(q.id)).filter(v => v).map(v => '· ' + v.slice(0, 150)).join('\n');
      const sys = '你是雅思口语串题覆盖挖掘助手。考生网站口语题库刚换季。下面给出每张素材卡的故事内容（概要+中文逻辑）、考生问卷原始经历、和它原来标的旧对照。你的任务不是翻译旧对照，而是**把每张卡放到新题库清单里全量重评一遍**：\n'
        + '1. 评估标准 = **考场可嫁接性**，不是字面包含：只要故事提供了一个「场景/时机」，让考生在考场上能自然补一句合理的小细节把题圆上，就算 loose 搭边可套。允许即兴补充合理细节——这正是串题的实战用法。\n'
        + '2. **场景型故事是万能辐射源**：旅行、学校生活、家庭聚会、常去的地方、日常爱好这类故事，凡是在该场景里合理出现的一切事物都可挂——住宿的建筑、看过的比赛、吃过的食物、遇到的人、排队拥挤、嘈杂安静、天气、拍的照片、难忘瞬间……\n'
        + '   例：去厦门旅行的故事 → 「喜欢或不喜欢的高建筑」loose（住的酒店楼层很高，窗外是海景）、「喜欢的现场体育赛事」loose（沙滩上正好有人在打排球）、「特别场合的食物」loose（团圆时吃的海鲜大餐）、「拥挤的地方」loose（轮渡口排队人山人海）、「难以回答的问题」类也可借旅行见闻圆。\n'
        + '3. 自然直接讲的就是 natural；需要补一句合理细节的是 loose；每张场景型卡通常可挂 10~20 题——**宁可多挂不可漏挂**，考场上不合适再现场放弃，漏挂的代价是考生根本不知道能套。\n'
        + '4. **抽象/观点类题必须重点扫（重要）**：想颁布的法律、想引入的规则、想做的改变、想解决的问题、想鼓励的传统/新时尚、挑战、认为重要/有价值的事这类**表达观点的抽象题**，不要求故事里真的发生过——任何故事都能用一句过渡句嫁接。公式：故事见闻/感受 → 引出观点（I saw …, so I want to …）。例：去厦门旅行的故事 →「想颁布的法律」loose（路上看到有人破坏环境，所以想颁布保护环境的法律）。**每张卡都要对照题库清单，把所有抽象/观点类题逐一过一遍**：只要故事见闻能自然引出一个想法/愿望/评价，就列入 coverage（loose），note 写清过渡句怎么讲。\n'
        + '4. 新 topic 必须**逐字取自新题库清单**；每条给 fit（natural|loose）、一句考场可直接念的英文点题句 bridgeEn（只用初中词汇、单一主谓简单句、15 词以内）和中文 note（loose 必须写清怎么圆，可以写"即兴补：…"）。\n'
        + '输出严格 JSON：{"mappings":[{"title":"素材卡标题","coverage":[{"topic":"","fit":"","bridgeEn":"","note":""}]}]}，不要任何解释文字。';
      const user = '素材卡列表：\n' + storyInfo + (rawAns ? '\n\n考生问卷原始经历（可从中取细节做即兴补充）：\n' + rawAns : '') + '\n\n新题库清单：\n' + newList;
      const content = await callRelay('material_remap', [ { role:'system', content:sys }, { role:'user', content:user } ], 0.4);
      const j = aiJson(content);
      if(!j || !Array.isArray(j.mappings)) throw new Error('重映射 JSON 解析失败');
      let applied = 0;
      j.mappings.forEach(mp => {
        const m = (store.materials || []).find(x => x && x.title === mp.title);
        if(m && Array.isArray(mp.coverage)){
          m.coverage = mp.coverage.filter(c => c && c.topic).map(c => ({ topic:String(c.topic), fit:String(c.fit || 'natural'), bridgeEn:String(c.bridgeEn || ''), note:String(c.note || '') }));
          applied++;
        }
      });
      store.bankVersion = DATA.speakingVersion;
      saveStore();
      if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
      render();
      toast('重映射完成：' + applied + ' 张素材卡已对齐新题库');
    }catch(e){
      render();
      toast('重映射失败：' + e.message);
    }
  }

  /* ---------- 结果页 ---------- */
  function renderResults(root){
    let h = '';
    // 换季提示（P2）：素材对照可能过时 → 给一键重映射
    // bankVersion == null = 旧版（本功能上线前）生成的存量素材，同样视为过时、给出重映射入口
    if(store.materials.length && store.bankVersion !== DATA.speakingVersion){
      const verTxt = store.bankVersion != null ? ('旧题库（v' + escapeHtml(String(store.bankVersion)) + '）') : '较早版本的题库';
      h += '<div class="mat-remap"><div class="mat-remap-txt"><b>题库已换季</b>：这些素材是' + verTxt + '时生成的，「可套当季题」对照可能已过时。故事本身是你自己的经历、不会过期——只是对照清单需要对齐。</div>'
        + '<button class="btn btn-primary" id="matRemap">一键深挖覆盖（对齐新题库）</button></div>';
    }
    // 当季覆盖矩阵（P1）：题库 P2 逐题对照素材 coverage，一眼看出「背这几个够不够」
    h += renderCoverageMatrix();
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
    (Array.isArray(store.materials) ? store.materials : []).forEach((m, i) => {
      if(!m) return;
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
          + ((m.coverage && m.coverage.length) ? '<div class="mat-sub">可套当季题 + 点题句（可直接念）</div><div class="mat-covs">'
              + m.coverage.map(c => '<div class="mat-cov"><span class="mat-cov-topic">' + escapeHtml(c.topic) + '</span>'
                + (c.bridgeEn ? '<div class="mat-bridge">' + escapeHtml(c.bridgeEn) + '</div>' : (c.note ? '<div class="mat-cov-note">' + escapeHtml(c.note) + '</div>' : ''))
                + '</div>').join('')
              + '</div>' : '')
          + '<div class="mat-mat-actions"><button class="mat-mini' + (m.pinned ? ' mat-pin-on' : '') + '" data-pin="' + i + '">' + (m.pinned ? '已置顶最熟 · 取消' : '置顶为最熟') + '</button><button class="mat-mini" data-regen-all="1" title="重新生成时保留置顶/手改过的卡">重新生成</button><button class="mat-mini danger" data-del="' + i + '">删除</button><button class="mat-mini" data-edit="' + i + '">更改</button></div>';
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
    // 「置顶为最熟」：标记 + 置顶排序——speaking 页 aiStoryLink 按此顺序取材（排最前的最熟）
    root.querySelectorAll('[data-pin]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.pin;
        const m = store.materials[i];
        if(!m) return;
        m.pinned = !m.pinned;
        if(m.pinned){
          // 置顶卡移到最前（保持相对顺序），数组顺序即素材优先级
          store.materials = store.materials.filter(x => x && x.pinned).concat(store.materials.filter(x => !x || !x.pinned));
        }
        saveStore();
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
        toast(m.pinned ? '已置顶为最熟素材（AI 串题时优先使用）' : '已取消置顶');
      };
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
    const mr = $('#matRemap');
    if(mr) mr.onclick = () => { remapCoverage(); };
    const md = $('#matDig');
    if(md) md.onclick = () => { remapCoverage(); };
    const ma = $('#matAsk');
    if(ma) ma.onclick = () => { askMissingTopics(); };
    $('#matRegen').onclick = () => { mode = 'q'; shortWarned = false; render(); };
  }

  /* ---------- 初始化 ---------- */
  // materials.html：页面加载即渲染
  ready(() => {
    if(store.materials.length) mode = 'result'; else mode = 'q';
    render();
  });
  // 口语页 MAT tab：挂 window.matGen（tab 点击时 init 从 DATA.materials 重载并渲染）
  // 并注册「云同步合并后无缝重渲染」，与旧内嵌版行为对齐
  window.matGen = { init: init, render: render };
  try{
    window.__hubRenderers = window.__hubRenderers || [];
    if(!window.__hubRenderers.includes(init)) window.__hubRenderers.push(init);
  }catch(_){}
})();
