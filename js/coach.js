/* === AI 口语陪练 coach v2（2026-10-03：完全自由对话版）===
   她拍板：不要定死练习模式的「答题机器」（旧 v1：强制一次一题/只纠语法/她说「先过其他题」
   被当答案批改）。要一个像聪明 AI 的口语老师：随时聊天、随时换题/下指令，闲聊中说错照样纠，
   说「别纠」就不纠，并且跨天记住她的习惯与常错点。

   v2 设计：
   - 对话全程自由文本：无 json_mode、无 P1/P2 切换、无「下一题」按钮、无前端推进状态机。
   - 真题库降级为快捷入口：「抽道 P1 真题」「抽道 P2 连讲」由前端从 SPEAKING_BANK 抽题
     （就业硬黑名单 WORK_BLOCK 保留），以【系统安排的当前话题】注入上下文，AI 不许改题。
   - 纠错：她说英语默认纠错，AI 用【必改】/【更地道】轻标记，前端渲染成卡片；
     「别纠语法」→会话内关，「继续纠」→开。
   - 长期记忆：每轮 AI 在正文后用 @@MEM@@ 追加新事实，前端剥离（用户不可见）后落
     DATA.coachMem（mergeData 按 text 跨设备并集，data.js 默认 [] 已登记）；
     顶栏「长期记忆」可查看/全部忘记。
   - 会话线程仅内存（window.__coachState 跨软导航，刷新=新对话）；跨天留下来的只有记忆。

   结构铁律沿用 v1：window.__COACH_ON 顶层先立（defer 按文档序，speaking.js tab 分支读它）；
   IIFE 重入只防重复绑定，DOM 没了就重建骨架；按钮 id + addEventListener；去本 script 引用
   即完整回滚到旧句型引擎（旧引擎文件全保留）。 */
window.__COACH_ON = true;
(function(){
  if(window.__coachBooted) return;
  window.__coachBooted = true;

  /* ============ 常量 ============ */
  var COACH_SERVICE = 'speaking_coach';
  var HIST_KEEP = 24;            // 上下文窗口（消息条，含双方）
  var MEM_MAX = 40;              // 长期记忆条数上限
  var MEM_MARK = '@@MEM@@';      // AI 正文后的记忆块分隔符（用户不可见）

  var FREQ_ZH = { ultra:'超高频', high:'高频', medium:'中频', low:'低频' };

  /* 就业题前端硬黑名单（她是大学生）：抽题 chips 的代码级兜底。
     "Are you looking forward to working?" 保留——学生可答。 */
  var WORK_BLOCK = [
    'What work do you do?',
    'Why did you choose to do that type of work (or that job)?',
    'Do you want to change to another job?'
  ];

  /* 10/4 09:40 改（她 01:44：「我首先映入眼帘的是这个考官跟我说一句话，说今天准备练什么」）
     旧版太笼统（「今天想怎么练都行」等于没说），新版明确抛问句 + 给可点的备选。 */
  var GREETING = '嗨，我是你的口语陪练。今天准备练什么？'
    + '\n\n可以直接用英语跟我说，或者点下面挑一个开始：';

  /* ============ 状态（挂 window 跨软导航；刷新即新会话） ============ */
  var st = window.__coachState || (window.__coachState = {
    built:false,
    thread:[],          // AI 上下文 [{role:'user'|'assistant', text}]（渲染不靠它，靠 DOM 事件）
    busy:false,
    correctOn:true,     // 会话内纠错开关（她口头切换；刷新回默认开）
    greeted:false,
    topic:'',           // chips 抽出的当前真题（纯自由聊天时为空）
    lastCard:'',        // 防连抽同卡
    /* 10/4 09:45：用户是否主动碰过输入框（focus 过）。build() 末尾只在 true 时才 ta.focus()，
       首次进陪练不抢焦点 → 移动端不再自动弹键盘（她 01:44 报的问题）。 */
    userTouched:false
  });

  /* ============ 长期记忆 ============ */
  function memList(){
    try{ return Array.isArray(DATA.coachMem) ? DATA.coachMem : []; }catch(e){ return []; }
  }
  function memBlock(){
    var a = memList();
    if(!a.length) return '（暂无：她还没告诉你任何长期信息）';
    return a.slice(-30).map(function(x){ return '- ' + (x && x.text); }).join('\n');
  }
  /* 从 AI 回复的 @@MEM@@ 尾巴里抽出新事实：每行 "- xxx"，去重、限长、过滤碎句 */
  function parseMemFacts(part){
    if(!part) return [];
    var seen = {}, out = [];
    String(part).split('\n').forEach(function(line){
      var t = String(line).trim().replace(/^[-•·*\d.、\s]+/, '').trim();
      if(!t || t.indexOf(MEM_MARK) === 0) return;
      if(t.length < 4 || t.length > 80) return;
      if(seen[t]) return;
      seen[t] = 1; out.push(t);
    });
    return out;
  }
  function saveMemFacts(facts){
    try{
      if(!facts || !facts.length || typeof DATA === 'undefined') return;
      if(!Array.isArray(DATA.coachMem)) DATA.coachMem = [];
      var exist = {};
      DATA.coachMem.forEach(function(x){ if(x && x.text) exist[x.text] = 1; });
      var now = Date.now(), added = 0;
      facts.forEach(function(t, i){
        if(exist[t]) return;
        DATA.coachMem.push({ t: now + i, text: t });
        exist[t] = 1; added++;
      });
      if(!added) return;
      if(DATA.coachMem.length > MEM_MAX) DATA.coachMem = DATA.coachMem.slice(-MEM_MAX);
      hubSave();
      updateMemBtn();
    }catch(e){ /* 记忆是锦上添花，任何异常都不许影响对话 */ }
  }
  function clearMem(){
    try{ DATA.coachMem = []; hubSave(); }catch(e){}
    updateMemBtn(); renderMemList();
    toast('好，我把之前记住的都忘掉了');
  }

  /* ============ System prompt（每轮按当前状态/记忆现拼） ============ */
  function buildSystem(){
    return [
      '你是郭润芝（之之/Camille）的雅思口语老师，也是她随时可以聊天的英语口语伙伴。',
      '她 10/9 机考雅思口语（P1/P2/P3），目标 5.5；上次实考口语 5.0（发音约 6，P2 连贯性卡顿最失分）。',
      '',
      '【她是谁】',
      '- 杭州人，大学生（计算机应用专业），住学校宿舍，ADHD（服用专注达）。',
      '- 已熟练表达（跳过不教）：I\'m into / I enjoy / I really like。',
      '- 高频语法弱点：冠词、三单 -s、动名词（be used to doing / enjoy doing）、过去分词（haven\'t done）、介词（on weekdays / far from）。',
      '',
      '【你记住的关于她的长期信息——每轮都要参考，按这些调整你的教法】',
      memBlock(),
      '',
      '【本轮状态】纠错：' + (st.correctOn ? '开' : '关') + '。'
        + (st.topic ? ('当前真题话题（她若已经聊到别处，以她的新话题为准）：' + st.topic + '。') : '当前无固定话题。'),
      '',
      '【怎么陪她——这是自由对话，不是答题机器】',
      '1. 她随时可以换题、跳题、闲聊、提问、下指令（"我们先过其他题""今天只练高频题""换个话题""讲慢一点"）。',
      '   先听懂并照做，用一两句简短中文应声确认；绝不许把她的指令当英语答案批改，绝不许回"语法全对"这种废话。',
      '2. 默认她是来练口语的：自然地把对话维持在英语练习上；但她就是想聊天时也好好聊——她说的每一句英语照样帮她长进。',
      '3. 她说英语时默认要纠错（当前开关见【本轮状态】）：',
      '   - 只纠语法/用词/句子结构；她用语音输入，不纠标点、大小写、空格和语音识别错字。',
      '   - 先自然回应她说话的内容，再另起下面两块（没有错误时【必改】整块省略，不要硬凑）：',
      '     【必改】',
      '     - 原文 → 改正（一条一个点）',
      '     【更地道】',
      '     一句完整的 5.5 档地道说法（初中词汇、短句、1-2 个连接词，不堆从句生僻词），让她能照着读两遍。',
      '   - 她说"别纠语法/不用纠/先别纠"：立即停止纠错并告诉她已关；等她说"继续纠/再帮我看看/恢复纠错"再打开。关闭期间只自然对话。',
      '4. 带练节奏：一次只自然给一个话题或问题，像真实聊天，不列题号、不机械闯关；她答完先当聊天对象回应，',
      '   再做老师该做的纠错/示范，然后自然推进或换题。',
      '   - 她是大学生：永远不问 What work do you do / Why did you choose that job 这类就业题；',
      '     "Are you looking forward to working?" 这种学生可答的可以。',
      '   - 她要练 P2：给 cue card（英文题 + you should say 四个小问的中文意思），请她像考场一样连讲约 2 分钟；',
      '     她讲完后点评连贯性优先（每个点有没有 because/so/and I felt 接出"线"，碎片并列必须点名），再给一段完整地道示范。',
      '   - 上下文里出现【系统安排的当前话题】时，题是考试系统从真题库抽的，你严禁另换一道英文题或改写题面，自然把她带进这道题即可。',
      '5. 她用 I like / I don\'t like 这类基础表达时，在【更地道】里给 I\'m really into / X appeals to me / I\'m not that into 等 5.5 档升级说法。',
      '6. 语言比例：对她说话以简短中文为主；需要她练习或跟读的内容用英文。正反馈要具体（好在哪一句），不寒暄堆砌、不复述她的话。',
      '7. 她是 ADHD：注意力飘走时温和拉回、别批评；她考前焦虑时先给一句实在的鼓励再继续。',
      '',
      '【记忆规则——严格照做】',
      '1. 每轮正文写完后，另起一行写 ' + MEM_MARK + '，后面每条新长知识占一行、以 "- " 开头（中文短句）：',
      '   她反复错的点、明确的喜好或讨厌、备考习惯、长期有效的要求。',
      '2. 上面【长期信息】已经有的绝不重复写；本轮没有值得长记的，' + MEM_MARK + ' 后面就留空。只记跨天还有用的，不记一次性细节。',
      '3. ' + MEM_MARK + ' 是给系统的记号，绝不能出现在你对她说的正文里，也不要主动告诉她你在写记忆。'
    ].join('\n');
  }

  /* ============ 真题库抽题（chips 用；保留 v1 的频次/黑名单口径） ============ */
  function cardsOf(type){
    return (typeof SPEAKING_BANK !== 'undefined' && SPEAKING_BANK || [])
      .filter(function(c){ return c && c.type === type; });
  }
  function drawP1(){
    var hi = cardsOf('P1').filter(function(c){ return c.frequency === 'ultra' || c.frequency === 'high'; });
    var pool = (hi.length ? hi : cardsOf('P1')).filter(function(c){ return c.id !== st.lastCard; });
    var card = pool.length ? pool[Math.floor(Math.random() * pool.length)]
      : cardsOf('P1')[0];
    if(!card || !card.questions || !card.questions.length) return null;
    var idxs = card.questions.map(function(_, i){ return i; }).filter(function(i){
      return !(card.id === 'sb_p1_work' && WORK_BLOCK.indexOf(card.questions[i]) !== -1);
    });
    if(!idxs.length) return null;
    st.lastCard = card.id;
    return {
      en: card.questions[idxs[Math.floor(Math.random() * idxs.length)]],
      zh: card.titleZh, freq: card.frequency, isP2: false, yss: []
    };
  }
  function drawP2(){
    var all = cardsOf('P2');
    var pool = all.filter(function(c){ return c.id !== st.lastCard; });
    var card = pool.length ? pool[Math.floor(Math.random() * pool.length)] : all[0];
    if(!card || !card.promptEn) return null;
    st.lastCard = card.id;
    return {
      en: card.promptEn, zh: card.promptZh, freq: card.frequency, isP2: true,
      yss: (card.youShouldSay || []).slice()
    };
  }

  /* ============ 纯逻辑（挂 window 供探针直测） ============ */
  window.__coachInternal = {
    parseMemFacts: parseMemFacts, saveMemFacts: saveMemFacts, memList: memList,
    buildSystem: buildSystem, drawP1: drawP1, drawP2: drawP2,
    stripReply: stripReply, assistantHtml: assistantHtml,
    state: st, WORK_BLOCK: WORK_BLOCK, MEM_MARK: MEM_MARK
  };

  /* 把 @@MEM@@ 尾巴从正文剥掉，返回 {reply, facts} */
  function stripReply(content){
    var raw = String(content == null ? '' : content);
    var idx = raw.lastIndexOf(MEM_MARK);
    var reply = raw, part = '';
    if(idx >= 0){ reply = raw.slice(0, idx); part = raw.slice(idx + MEM_MARK.length); }
    reply = reply.trim();
    if(!reply) reply = raw.replace(/@@MEM@@[\s\S]*$/, '').trim() || '我在的，你继续说～';
    return { reply: reply, facts: parseMemFacts(part) };
  }

  /* ============ 渲染 ============ */
  function $(id){ return document.getElementById(id); }

  function scrollBottom(){
    var sc = $('coachScroll');
    if(!sc) return;
    /* 10/3 22:06：滚动容器已改为 #coachScroll 自己（区间自滚）。
       旧实现滚的是 main.container / window —— 现在那两个都不再是滚动容器，
       继续用它们会导致「消息追加了但视图不动」。保持 window 兜底（移动端键盘弹起时）。 */
    try{ sc.scrollTop = sc.scrollHeight; }catch(_){}
    /* 展开右栏/折叠右栏后高度变了，必须再滚一次贴底 */
    try{ layoutCoach(); sc.scrollTop = sc.scrollHeight; }catch(_){}
  }
  function appendHtml(html){
    var sc = $('coachScroll');
    if(sc) sc.insertAdjacentHTML('beforeend', html);
  }

  function topicCardHtml(t){
    var tag = t.isP2 ? '<span class="cq-part">P2 连讲</span>' : '<span class="cq-part">P1</span>';
    var freq = t.freq ? '<span class="cq-freq">' + escapeHtml(FREQ_ZH[t.freq] || '') + '</span>' : '';
    var body = '<div class="cq-en">' + escapeHtml(t.en) + '</div>'
      + '<div class="cq-zh">' + (t.isP2 ? '话题：' : '') + escapeHtml(t.zh || '') + '</div>';
    if(t.isP2 && t.yss.length){
      body += '<ul class="cq-yss">' + t.yss.map(function(y){ return '<li>' + escapeHtml(y) + '</li>'; }).join('') + '</ul>'
        + '<div class="cq-hint">像考场一样连续讲约 2 分钟，把每个点用 because / so / and I felt 接成一条线。</div>';
    }
    /* B 版：题卡加 teal 渐变头部条（P1 徽标 + 频次 + 真题出处） */
    return '<div class="cq-card"><div class="cq-head">' + tag + freq
      + '<span class="cq-src">真题 · 站内题库</span></div>'
      + '<div class="cq-body">' + body + '</div></div>';
  }

  /* B 版：气泡加头像（此前 AI 与用户都无头像，一眼看不出谁在说）。
     静态写死 SVG —— JS innerHTML 拼的内联 SVG 不渲染（铁律）。
     10/3：用户气泡头像改为读设置里选的（av-picker.js 暴露 window.avUserSrc()），没选时回退静态人像。 */
  /* 10/4（她 13:20 拍板）：头像从顶栏搬到气泡左边 —— 顶栏只留「AI 口语陪练 / 自由对话」两行字。
     气泡头像即考官形象入口：点它开同一个选考官弹层。未选形象时由 .coach-av-fb（学士帽）兜底，不破图。
     ⚠️ 副作用（正向）：此前气泡恒为学士帽、顶栏才是考官形象，换考官后气泡不跟着变；
        现在两者合一，换完考官所有气泡一起刷新（sync 见 initExamAv）。 */
  var AV_AI = '<button type="button" class="coach-av" data-exam-av aria-haspopup="dialog"'
    + ' aria-controls="avatarPop" aria-expanded="false" title="点击更换考官的样子">'
    + '<span class="coach-av-fb" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5"/></svg></span>'
    + '<img class="coach-av-img" src="" alt="" />'
    + '</button>';
  /* 用户头像：<img src>（外部 SVG 文件可渲染，内联不行）。
     avUserSrc 缺失（未引 av-picker.js）或图片加载失败时，CSS 让 img 隐藏、露出后面的静态人像兜底 —— 不用 inline onerror（多层引号太脆）。 */
  var AV_ME_FALLBACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
  function avMeHtml(){
    var src = (typeof window !== 'undefined' && typeof window.avUserSrc === 'function') ? window.avUserSrc() : '';
    if(!src) return '<span class="coach-av">' + AV_ME_FALLBACK + '</span>';
    return '<span class="coach-av coach-av-picked">' + AV_ME_FALLBACK
         + '<img class="coach-av-user" src="' + src + '" alt=""></span>';
  }

/* 10/3 头像：把 userHtml 挂到 window 供探针/调试驱动（生产无副作用，外部不调就是 undefined）。
   真实用户路径是 sendText() 调它 —— 那条要联网等 AI 回来，探针不方便等。 */
window.__COACH_USER_HTML = function(t){ return userHtml(t); };
function userHtml(text){
    return '<div class="cu-row">' + avMeHtml() + '<div class="cu-bubble">'
      + escapeHtml(text).replace(/\n/g, '<br>') + '</div></div>';
  }

  /* 行内：**粗体**（已转义后处理，安全） */
  function inline(t){
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  /* AI 自由文本 → HTML：空行分块；【必改】/【更地道】起头的块渲染成卡片，其余普通段落 */
  function assistantHtml(s){
    var blocks = String(s == null ? '' : s).replace(/\r/g, '').split(/\n{2,}/);
    var inner = blocks.map(function(b){
      b = b.trim();
      if(!b) return '';
      if(b.indexOf('【必改】') === 0){
        var lines = b.replace(/^【必改】\s*/, '').split('\n');
        var items = lines.filter(function(l){ return /^\s*[-•]/.test(l); });
        var note = lines.filter(function(l){ return !/^\s*[-•]/.test(l) && l.trim(); });
        var h = '<div class="ca-fix"><div class="ca-fix-t">必改</div><ul>'
          + items.map(function(l){ return '<li>' + inline(escapeHtml(l.replace(/^\s*[-•]\s*/, ''))) + '</li>'; }).join('')
          + '</ul>'
          + note.map(function(l){ return '<div class="ca-note">' + inline(escapeHtml(l)) + '</div>'; }).join('')
          + '</div>';
        return h;
      }
      if(b.indexOf('【更地道】') === 0){
        var t = b.replace(/^【更地道】\s*/, '');
        return '<div class="ca-nat"><span class="ca-nat-t">更地道 · 照着读两遍</span><div>'
          + t.split('\n').map(function(l){ return inline(escapeHtml(l)); }).join('<br>') + '</div></div>';
      }
      return '<p class="ca-p">' + b.split('\n').map(function(l){ return inline(escapeHtml(l)); }).join('<br>') + '</p>';
    }).join('');
    return '<div class="ca-row">' + AV_AI + '<div class="ca-bubble">' + inner + '</div></div>';
  }

  function chipsHtml(){
    return '<div class="cc-row" id="coachChips">'
      + '<button type="button" data-chip="p1">抽道 P1 真题</button>'
      + '<button type="button" data-chip="p2">抽道 P2 连讲</button>'
      + '<button type="button" data-chip="hi">今天只练高频题</button>'
      + '</div>';
  }
  function hideChips(){ var el = $('coachChips'); if(el) el.remove(); }

  /* ============ 交互 ============ */
  function setBusy(b){
    st.busy = b;
    var inp = $('coachInput'), btn = $('coachSend');
    if(inp) inp.disabled = b;
    if(btn){ btn.disabled = b; btn.textContent = b ? '思考中…' : '发送'; }
    /* 10/4 09:45：AI 回完话要不要把焦点还给输入框？只在用户自己碰过输入框时才还，
       否则首次陪练/纯浏览时也会把焦点抢到输入框（移动端 = 键盘弹出来）。 */
    if(!b && inp && st.userTouched){ try{ inp.focus(); }catch(_){} }
  }

  /* text 显式传入用于 chips 指令；undefined 时读输入框 */
  async function sendText(text){
    if(st.busy) return;
    var inp = $('coachInput');
    var raw = (text != null ? text : (inp ? inp.value : ''));
    var msg = String(raw == null ? '' : raw).trim();
    if(!msg){ return; }
    if(inp && text == null) inp.value = '';

    /* 纠错开关的口头切换：本地状态即时生效（system 本轮就带上），AI 也会自然应声 */
    if(/别纠|不用纠|不要纠|先不纠|不纠错|别再纠/.test(msg)) st.correctOn = false;
    else if(/继续纠|恢复纠|再帮我纠|接着纠|开始纠|帮我看.*语法/.test(msg)) st.correctOn = true;

    appendHtml(userHtml(msg));
    st.thread.push({ role: 'user', text: msg });
    ctxTouch();          // 10/3 A版：首条用户消息起启动本轮计时并刷新右栏
    hideChips();
    setBusy(true);
    scrollBottom();

    var msgs = [{ role: 'system', content: buildSystem() }];
    st.thread.slice(-HIST_KEEP).forEach(function(r){ msgs.push({ role: r.role, content: r.text }); });

    var content = null, failed = null;
    try{
      content = await callRelay(COACH_SERVICE, msgs, 0.8, { max_tokens: 1400 });
    }catch(e){ failed = e; }

    if(failed){
      /* 失败绝不推进：撤上下文、撤气泡、回填输入，让她原样重发（v1 口径） */
      st.thread.pop();
      var rows = document.querySelectorAll('#coachScroll .cu-row');
      if(rows.length) rows[rows.length - 1].remove();
      renderCtx();    // 10/3 A版：失败已撤上下文，右栏轮次必须同步回退
      if(inp && text == null) inp.value = msg;
      setBusy(false);
      var code = failed.code;
      if(code === 'AUTH_REQUIRED' || code === 'auth_required') toast('请先登录后再用 AI 陪练');
      else if(code === 'user_limit') toast('本周免费 AI 额度用完了，会员不限次（VIP 页开通）');
      else if(failed.isTimeout) toast(failed.message);
      else toast('网络异常，没发出去，再试一次');
      return;
    }

    var r = stripReply(content);
    saveMemFacts(r.facts);
    st.thread.push({ role: 'assistant', text: r.reply });
    appendHtml(assistantHtml(r.reply));
    renderCtx();      // 10/3 A版：AI 回复里可能带 @@MEM@@ 新记忆，右栏同步刷新
    setBusy(false);
    scrollBottom();
  }

  function onChip(k){
    if(st.busy) return;
    hideChips();
    if(k === 'hi'){ sendText('今天我们只练高频/超高频题，其他题先不练'); return; }
    var t = k === 'p2' ? drawP2() : drawP1();
    if(!t){ toast('题库还没加载好，稍后再试'); appendHtml(chipsHtml()); return; }
    st.topic = (t.isP2 ? 'P2 连讲：' : 'P1：') + t.en;
    appendHtml(topicCardHtml(t));
    /* 真题以 assistant 上下文注入（渲染走题卡不走气泡）：AI 看到后知道题、她答后据此带练，
       抽题当下不耗 AI 调用（像 v1 一样题面是本地的）。 */
    var ctx = t.isP2
      ? '【系统安排的当前话题】（考试系统从真题库抽的 P2 cue card，你严禁改题/另出题）题目：' + t.en
        + '；中文：' + t.zh + '；You should say：' + t.yss.join(' / ')
        + '。请用一句中文请她连讲约 2 分钟，她讲完前不要给示范。'
      : '【系统安排的当前话题】（考试系统从真题库抽的题，你严禁改题/另出题）问题：' + t.en
        + '（' + t.zh + '）。用一句中文点一下问题意思、鼓励她直接开口作答，不要自问自答。';
    st.thread.push({ role: 'assistant', text: ctx });
    /* 无 AI 开场调用：题卡即开场，等她开口；她的下一条消息一到，AI 带着题目上下文回应 */
    scrollBottom();
    try{ $('coachInput').focus(); }catch(_){}
  }

  /* ============ 长期记忆弹层 ============ */
  function updateMemBtn(){
    var n = $('coachMemN');
    if(n) n.textContent = String(memList().length);
  }
  function renderMemList(){
    var ul = $('cmpList');
    if(!ul) return;
    var a = memList();
    ul.innerHTML = a.length
      ? a.slice().reverse().map(function(x){ return '<li>' + escapeHtml(x.text || '') + '</li>'; }).join('')
      : '<li class="cmp-empty">还没有记住什么。多聊几轮，我会把你反复错的点、喜好和长期要求记在这里。</li>';
  }
  function openMem(){ renderMemList(); var p = $('coachMemPop'); if(p) p.hidden = false; }
  function closeMem(){ var p = $('coachMemPop'); if(p) p.hidden = true; }

  /* ============ 10/3 A 版：常驻上下文栏（纯新增，不改既有函数体） ============ */
  var CTX_MAX_MEM = 5;          // 右栏最多列几条记忆，其余引导去弹层
  var CTX_TURN_FULL = 6;        // 6轮视为本轮练满（进度条 100%）
  var ctxTimer = null, ctxT0 = 0;

  function ctxFmtDur(sec){
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + '′' + (r < 10 ? '0' : '') + r + '″';
  }
  function ctxTurns(){
    try{
      return (st && st.thread ? st.thread : []).filter(function(x){ return x && x.role === 'user'; }).length;
    }catch(e){ return 0; }
  }
  function renderCtxMem(){
    var ul = $('coachCtxMem'); if(!ul) return;
    var a = memList();
    if(!a.length){
      ul.innerHTML = '<li class="coach-ctx-empty">还没记住什么 · 多聊几轮就会出现在这里</li>';
    }else{
      /* B 版：常驻面板里要一眼看清「它记住了什么」，故完整显示（不再截断 30 字），
         圆点由 CSS ::before 出，不额外拼元素。 */
      ul.innerHTML = a.slice(-CTX_MAX_MEM).reverse().map(function(x){
        var t = String((x && x.text) || '');
        return '<li>' + escapeHtml(t.length > 40 ? t.slice(0, 40) + '…' : t) + '</li>';
      }).join('');
    }
    var n2 = $('coachMemN2'); if(n2) n2.textContent = String(a.length);
    var n1 = $('coachMemN');
    if(n1) n1.textContent = String(a.length);
  }
  function renderCtx(){
    if(!$('coachCtxBar')) return;
    var n = ctxTurns();
    var pct = Math.min(100, Math.round(n / CTX_TURN_FULL * 100));
    var bar = $('coachCtxBar');
    bar.style.width = pct + '%';
    var wrap = $('coachCtxBarWrap');
    if(wrap) wrap.setAttribute('aria-valuenow', String(pct));
    var tn = $('coachCtxTurn'); if(tn) tn.textContent = String(n);
    var tt = $('coachCtxTime');
    if(tt) tt.textContent = ctxFmtDur(ctxT0 ? Math.floor((Date.now() - ctxT0) / 1000) : 0);
    renderCtxMem();
  }
  function ctxStart(){
    if(ctxTimer) return;
    ctxT0 = Date.now();
    ctxTimer = setInterval(renderCtx, 1000);
  }
  function ctxTouch(){ ctxStart(); renderCtx(); }
  /* 折叠状态：复用站内存量DATA.settings.coachCtxCollapsed + hubSave()，与侧边栏收起同一套云同步机制。
     10/3 22:06：折叠态 CSS 从「40px 白条」改成 display:none（她嫌那条白条怪），
     入口改到顶栏 #coachMemBtn —— 它的文案与 aria-expanded 随状态翻转。 */
  /* 10/4（她拍板）：手机上教练台默认收起（点开才出现）；桌面维持原样（默认展开）。
     两者互不干扰 —— 窄屏的开合只记在这个内存标志里，**不写回 DATA**，
     否则「手机上收起」会连带把桌面的右栏也收起来（同一个持久化开关）。 */
  var __narrowCtxCollapsed = true;
  function ctxApplyState(){
    var narrowNow = window.matchMedia('(max-width:860px)').matches;
    var col = narrowNow ? __narrowCtxCollapsed : !!DATA.settings.coachCtxCollapsed;
    var aside = $('coachCtx'); if(!aside) return;
    aside.classList.toggle('coach-ctx-mini', col);
    var btn = $('coachCtxToggle');
    if(btn){
      btn.setAttribute('aria-expanded', col ? 'false' : 'true');
      btn.textContent = '收起';
    }
    /* 10/4（她 13:20 拍板）：文案固定「本轮教练台」，不再随屏幕变。
       窄屏原本写成「它记住的 N 件事」且点开是记忆弹层 —— 名字对不上「教练台」、行为也不一致，
       她明确要求统一成「点一下展开教练台、再点折叠」。 */
    var top = $('coachMemBtn');
    if(top){
      top.setAttribute('aria-expanded', col ? 'false' : 'true');
      var label = top.querySelector('.coach-mem-label');
      if(label) label.textContent = '本轮教练台';
      var caret = top.querySelector('.coach-mem-caret');
      if(caret) caret.textContent = col ? '›' : '‹';
    }
    layoutCoach();
  }
  function ctxToggle(){
    /* 窄屏走内存标志（默认收起），宽屏走持久化设置 —— 理由见 __narrowCtxCollapsed 处注释。 */
    if(window.matchMedia('(max-width:860px)').matches){
      __narrowCtxCollapsed = !__narrowCtxCollapsed;
      ctxApplyState();
      return;
    }
    DATA.settings.coachCtxCollapsed = !DATA.settings.coachCtxCollapsed;
    hubSave();
    ctxApplyState();
  }
  function initCtx(){
    if(!$('coachCtx')) return;
    ctxApplyState();
    renderCtx();
    var btn = $('coachCtxToggle');
    if(btn) btn.addEventListener('click', ctxToggle);
    /* 10/4（她 13:20 拍板）：顶栏按钮统一 = 教练台开关，宽窄屏行为一致。
       此前 ≤860 是「开长期记忆弹层」（10/3 22:06 的分流），与「本轮教练台」这个名字对不上。
       ⚠️ 长期记忆入口没丢：面板内「全部记忆 ›」仍是 openMem（#coachCtxMore）；
          窄屏教练台现在本身就能展开（CSS 改见 speaking.html ≤860 块）。 */
    var mqNarrow = window.matchMedia('(max-width:860px)');
    function topBtnOn(){ ctxToggle(); }
    if(mqNarrow.addEventListener) mqNarrow.addEventListener('change', ctxApplyState);
    var top = $('coachMemBtn');
    if(top) top.addEventListener('click', topBtnOn);
    var more = $('coachCtxMore');
    if(more) more.addEventListener('click', openMem);
    window.addEventListener('resize', layoutCoach);
  }

  /* 考官头像选择器（10/3 22:55 从设置页挪来）：顶栏点头像 → av-picker 弹层换考官。
     ⚠️ speaking.html 已新引 av-picker.js（必须在 coach.js 之前），否则 avOpen 不存在、
     点头像没反应。src 同步用「短轮询 + 结束即清」：av-picker 选完只改自己的 img
     （syncAccountCard 只管设置页），本页要等它把新图刷过来。 */
  function initExamAv(){
    /* 10/4（她 13:20 拍板）：入口从顶栏搬到气泡头像（#coachExamAvBtn / #coachExamAvImg 已退役）。
       气泡是动态渲染、且可能同时存在多条 —— 所以：
       · 形象同步用选择器刷【全部】气泡头像，不再抓一个固定 id；
       · 点击继续用 document 事件委托（气泡会被重渲染，直接绑节点一定会丢）。 */
    function examImgs(){
      return document.querySelectorAll('#coachView [data-exam-av] img');
    }
    function sync(){
      if(typeof window.avExamSrc !== 'function') return;
      var want = window.avExamSrc();
      examImgs().forEach(function(im){
        if(im.getAttribute('src') !== want) im.setAttribute('src', want);
      });
    }
    /* 10/4 10:20 加固（她 01:44 报「陪练考官头像弹出来了，但点完成和✕ 没反应」）
       —— 节点是 build() 动态插进去的，弱网 / CF Pages 的 .html→/ 跳转会让它被丢弃重建。
       —— 用【事件委托挂在 document 上】再绑一次：节点换了也照样生效。 */
    if(!window.__coachAvDelegated){
      window.__coachAvDelegated = true;
      document.addEventListener('click', function(e){
        var t = e.target;
        if(!t || !t.closest) return;
        if(t.closest('[data-exam-av]')){
          if(typeof window.avOpen === 'function'){ window.avOpen('exam'); }
          else { toast('头像选择器还在加载，稍等一下'); }
        }
      }, true);
    }
    sync();
    /* 10/3 22:55：换考官后要即时刷头像。原先用「弹层关掉就停」的轮询 ——
       点完「完成」弹层立刻关 → 轮询在 DATA 落库生效前就停了 → src 永远不更新（探针抓到过）。
       改成：弹层开着期间持续 sync（覆盖用户点选的那一刻），关掉后再多跑 1.2s 收尾，
       并在 8s 兜底停止，防定时器泄漏。
       ⚠️ 10/4：判据原本读顶栏按钮的 aria-expanded，该按钮已退役 → 改读 #avatarCard 的 hidden。 */
    var iv = setInterval(function(){
      sync();
      var cardEl = document.getElementById('avatarCard');
      if(cardEl && cardEl.hidden){
        clearInterval(iv);
        setTimeout(function(){ clearInterval(iv); }, 0);
      }
    }, 300);
    setTimeout(function(){ clearInterval(iv); }, 8000);
    /* 兜底再刷一次（弹层关掉后 DATA 已落库，此时直接同步最稳） */
    var card = document.getElementById('avatarCard');
    if(card) card.addEventListener('click', function(e){
      if(e.target && e.target.closest && e.target.closest('.av-opt')) setTimeout(sync, 60);
    });
  }

  /* 10/3 22:06：把 #coachView 限成「视口 - 顶栏实测高 - 输入条 - 净空」，
     让 #coachScroll 成为真正的滚动容器（CSS 静态兜底已写，此处按实测值校正，
     顶栏高度随视口/字体/缩放变化，写死会在某些窗口里又滑到底）。
     —— 只在陪练可见时算，避免隐藏态 getBoundingClientRect 全是 0。 */
  function layoutCoach(){
    var view = $('coachView');
    if(!view || view.hidden || !view.offsetParent) return;
    var bar = $('coachBar');
    var topH = 0;
    var top = $('coachTop');
    if(top) topH = Math.round(top.getBoundingClientRect().height);
    var barH = bar ? Math.round(bar.getBoundingClientRect().height) : 69;
    var cs = getComputedStyle(document.querySelector('main.container') || document.body);
    var padT = parseInt(cs.paddingTop, 10) || 0;
    var padB = parseInt(cs.paddingBottom, 10) || 0;
    var gap = 18;
    var h = window.innerHeight - padT - padB - topH - barH - gap;
    if(h < 320) h = 320;
    view.style.height = h + 'px';
  }

  /* ============ 骨架构建（懒：第一次切到陪练 tab 才建，整页生命周期只建一次） ============ */
  function build(){
    var view = $('coachView');
    if(!view) return;
    /* 10/3 B→A 版重设计：#coachWrap 由「单列居中」改为「三栏 flex 容器」。
       聊天列 #coachCol 左（自适应），上下文栏 #coachCtx 右（可折叠）。
       记忆弹层 #coachMemPop 移出 #coachWrap —— 避免被三栏的 overflow/flex 影响定位。 */
    /* 10/3 B 版「双栏工作台」重设计：右栏从 40px 窄条改为**常驻 274px 真面板**——
       上下文（模式/目标/轮次/时长）改成 2×2 指标卡，「它记住的事」直接列在面板里常驻可见，
       底部加一句常驻提示（说「别纠语法」可关纠错）—— 该功能此前完全无可发现性。
       id 全部沿用（coach.js 动态绑定 14 个 id，改 id 功能直接坏），
       记忆弹层 #coachMemPop 仍移出 #coachWrap —— 避免被三栏的 flex/overflow 影响定位。 */
    view.innerHTML =
      '<div id="coachWrap">'
      + '<div id="coachCol">'
      +   '<div id="coachTop">'
      +     '<div class="coach-who">'
      /* 10/4（她拍板）：顶栏头像已删 —— 头像统一放到气泡左边（见 AV_AI 的 data-exam-av）。
         顶栏只剩昵称两行字；换考官入口随之搬到气泡头像，功能不丢。 */
      +       '<span class="coach-who-tx"><b>AI 口语陪练</b><span>自由对话</span></span>'
      +     '</div>'
      /* 10/3 22:55：头像弹层容器（考官选择器）。设置页有同名容器，这里是陪练页自己的。 */
      +     '<div id="avatarCard" hidden></div>'
      /* 10/4（她 13:20 拍板）：这个按钮固定叫「本轮教练台」，点一下展开教练台、再点折叠。
         此前窄屏点它是「开记忆弹层」、宽屏才是切右栏 —— 行为随屏幕变，她明确要统一成面板开合。
         去掉 aria-haspopup（它现在是展开/收起按钮，不是弹层入口）。
         #coachMemN 保留为隐藏计数（updateMemBtn / renderCtx 会写它，探针也断言它，删了会静默失效）。 */
      +     '<button id="coachMemBtn" type="button" class="coach-mem-btn"'
      +       ' aria-controls="coachCtx" aria-expanded="true"><span class="coach-mem-label">本轮教练台</span> <span class="coach-mem-caret" aria-hidden="true">‹</span></button>'
      +     '<span id="coachMemN" hidden>0</span>'
      +   '</div>'
      +   '<div id="coachScroll" aria-live="polite"></div>'
      +   '<div id="coachBar"><div id="coachBarInner">'
      +     '<div class="coach-cbox"><textarea id="coachInput" rows="1" maxlength="2000" placeholder="说英语，或直接下指令"></textarea></div>'
      +     '<button id="coachSend" type="button">发送</button>'
      +   '</div></div>'
      + '</div>'
      /* 右栏：常驻真面板（274px）。仍在 #coachScroll 之外 —— scroll 内是动态追加的聊天流。 */
      + '<aside id="coachCtx" class="coach-ctx" aria-label="本轮教练台">'
      +   '<div class="coach-ctx-head">'
      +     '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20h-20"/></svg>'
      +     '<b>本轮教练台</b>'
      +     '<button type="button" id="coachCtxToggle" class="coach-ctx-toggle" aria-expanded="true" aria-controls="coachCtxBody" title="收起/展开上下文">收起</button>'
      +   '</div>'
      +   '<div id="coachCtxBody" class="coach-ctx-body">'
      +     '<div class="coach-ctx-blk-t">本轮</div>'
      +     '<div class="coach-ctx-metrics">'
      +       '<div class="coach-ctx-m hl"><span>已练轮次</span><b id="coachCtxTurn">0</b></div>'
      +       '<div class="coach-ctx-m hl"><span>时长</span><b id="coachCtxTime">0′00″</b></div>'
      +       '<div class="coach-ctx-m"><span>模式</span><b id="coachCtxMode">自由对话</b></div>'
      +       '<div class="coach-ctx-m"><span>目标</span><b id="coachCtxGoal">6.0 · 口语 5.5</b></div>'
      +     '</div>'
      +     '<div class="coach-ctx-bar" id="coachCtxBarWrap" role="progressbar" aria-label="本轮进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="coachCtxBar"></i></div>'
      +     '<div class="coach-ctx-blk-t">它记住的事 · <span id="coachMemN2">0</span></div>'
      +     '<ul class="coach-ctx-mem" id="coachCtxMem"><li class="coach-ctx-empty">还没记住什么 · 多聊几轮就会出现在这里</li></ul>'
      +     '<button type="button" id="coachCtxMore" class="coach-ctx-more">全部记忆 →</button>'
      +   '</div>'
      +   '<div class="coach-ctx-hint"><b>说「别纠语法」</b>可在本轮关掉纠错，说「继续纠」恢复。</div>'
      + '</aside>'
      + '<div id="coachMemPop" hidden>'
      +   '<div class="cmp-mask"></div>'
      +   '<div class="cmp-card" role="dialog" aria-modal="true" aria-label="陪练长期记忆">'
      +     '<div class="cmp-head"><b>它记住你的事</b><button id="cmpClose" type="button" aria-label="关闭">✕</button></div>'
      +     '<ul id="cmpList"></ul>'
      +     '<button id="cmpClear" type="button">全部忘记</button>'
      +   '</div>'
      + '</div>'
      + '</div>';

    $('coachSend').addEventListener('click', function(){ sendText(); });
    initCtx();           // 10/3 A版：初始化上下文栏（折叠状态 + 首渲染 + 事件）
    initExamAv();        // 10/3 22:55：顶栏考官头像选择器（她拍板从设置页挪来）
    var ta = $('coachInput');
    /* 10/4 09:45：记住用户主动碰过输入框 —— 之后 build()/setBusy 才允许自动聚焦回输入框 */
    ta.addEventListener('focus', function(){ st.userTouched = true; });
    ta.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
        e.preventDefault();
        sendText();
      }
    });
    ta.addEventListener('input', function(){
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
    });

    /* chips 事件委托（chips 会随首条消息移除、重渲染无需重绑） */
    $('coachScroll').addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('#coachChips button[data-chip]') : null;
      if(b) onChip(b.getAttribute('data-chip'));
    });

    /* 10/3 22:06：删掉这里的 $('coachMemBtn').addEventListener('click', openMem) ——
       顶栏按钮已改由 initCtx() 的 topBtnOn 接管（桌面=切右栏 / ≤860=开记忆弹层）。
       两处都绑会导致点一下既折叠右栏又弹记忆弹层（探针截图抓到的现象）。 */
    $('cmpClose').addEventListener('click', closeMem);
    document.querySelector('#coachMemPop .cmp-mask').addEventListener('click', closeMem);
    $('cmpClear').addEventListener('click', function(){
      if(memList().length && confirm('确定让陪练把记住的关于你的事全部忘掉吗？')) clearMem();
    });

    /* 移动端键盘弹起：visualViewport 上浮底栏（v1 实测口径，逐字保留） */
    if(window.visualViewport){
      var adj = function(){
        var bar = $('coachBar');
        if(!bar) return;
        var vv = window.visualViewport;
        var off = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
        var dockH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0;
        var v = off > dockH ? off : (off > 0 ? dockH : 0);
        bar.style.bottom = v ? v + 'px' : '';
      };
      window.visualViewport.addEventListener('resize', adj);
      window.visualViewport.addEventListener('scroll', adj);
    }

    st.built = true;
    updateMemBtn();



    /* 10/3 22:06：首屏布局校正延到下一帧 —— initCtx() 里调 layoutCoach 时，
       本轮的问候气泡/chips 还没进 DOM，高度算不准（会算出一个偏矮的值把内容截掉）。 */
    requestAnimationFrame(function(){ layoutCoach(); scrollBottom(); });

    /* 首次进陪练：本地问候 + chips（不耗 AI 调用） */
    if(!st.greeted){
      st.greeted = true;
      appendHtml(assistantHtml(GREETING));
      st.thread.push({ role: 'assistant', text: GREETING });
      appendHtml(chipsHtml());
    }
    scrollBottom();
    /* 10/4 09:45 修「点进陪练手机端自动弹键盘」（她 01:44 报「每次点到陪练它会强制给我弄起来那个输入法」）
       —— 根因就是这行**无条件 focus()**：build() 是切 tab 时跑的，用户还没点任何东西，
          焦点就被抢到输入框 → 移动端立刻弹键盘。
       —— 修法：只在「用户主动点过页面/输入框」之后才聚焦（st.userTouched 由输入框 focus 事件置位），
          首次进来不抢焦点，键盘等他真要打字才弹。 */
    if(st.userTouched){ try{ ta.focus(); }catch(_){} }
    else { try{ ta.blur(); }catch(_){} }
  }

  /* speaking.js 三个 PRACTICE 入口统一调它：首次建骨架，之后只保状态 */
  window.__coachShow = function(){
    if(!st.built || !$('coachWrap')) build();
    /* 10/3 22:06：软导航切进陪练 tab 后必须重算限高 —— #coachView 隐藏时
       getBoundingClientRect 全是 0，build() 里算的高度对不上显示后的真实布局。 */
    else { layoutCoach(); scrollBottom(); }
  };
  /* 10/3 22:06：把 scrollBottom 挂到 window，供验收探针走真实贴底路径
     （区间自滚改造后，探针不能再靠 window.scrollTo 模拟）。 */
  window.__coachScrollBottom = scrollBottom;
})();
