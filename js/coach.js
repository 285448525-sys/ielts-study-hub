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

  var GREETING = '嗨，我在～今天想怎么练都行：直接用英语跟我聊，或者点下面抽道真题；'
    + '也可以用中文吩咐我，比如「今天只练高频题」「先别纠语法」。';

  /* ============ 状态（挂 window 跨软导航；刷新即新会话） ============ */
  var st = window.__coachState || (window.__coachState = {
    built:false,
    thread:[],          // AI 上下文 [{role:'user'|'assistant', text}]（渲染不靠它，靠 DOM 事件）
    busy:false,
    correctOn:true,     // 会话内纠错开关（她口头切换；刷新回默认开）
    greeted:false,
    topic:'',           // chips 抽出的当前真题（纯自由聊天时为空）
    lastCard:''         // 防连抽同卡
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
    /* ≤860 App Shell 下滚的是 main.container，桌面是 window（v1 已验证） */
    var main = sc.closest ? sc.closest('main.container') : null;
    if(main && main.scrollHeight > main.clientHeight) main.scrollTop = main.scrollHeight;
    try{ window.scrollTo(0, document.documentElement.scrollHeight); }catch(_){}
  }
  function appendHtml(html){
    var sc = $('coachScroll');
    if(sc) sc.insertAdjacentHTML('beforeend', html);
  }

  function topicCardHtml(t){
    var tag = t.isP2 ? '<span class="cq-part">P2 连讲</span>' : '<span class="cq-part">P1 真题</span>';
    var freq = t.freq ? '<span class="cq-freq">' + escapeHtml(FREQ_ZH[t.freq] || '') + '</span>' : '';
    var body = '<div class="cq-en">' + escapeHtml(t.en) + '</div>'
      + '<div class="cq-zh">' + (t.isP2 ? '话题：' : '') + escapeHtml(t.zh || '') + '</div>';
    if(t.isP2 && t.yss.length){
      body += '<ul class="cq-yss">' + t.yss.map(function(y){ return '<li>' + escapeHtml(y) + '</li>'; }).join('') + '</ul>'
        + '<div class="cq-tip">像考场一样连续讲约 2 分钟，把每个点用 because / so / and I felt 接成一条线。</div>';
    }
    return '<div class="cq-card"><div class="cq-tags">' + tag + freq + '</div>' + body + '</div>';
  }

  function userHtml(text){
    return '<div class="cu-row"><div class="cu-bubble">'
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
    return '<div class="ca-row"><div class="ca-bubble">' + inner + '</div></div>';
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
    if(!b && inp){ try{ inp.focus(); }catch(_){} }
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
      ul.innerHTML = a.slice(-CTX_MAX_MEM).reverse().map(function(x){
        var t = String((x && x.text) || '');
        return '<li>' + escapeHtml(t.length > 30 ? t.slice(0, 30) + '…' : t) + '</li>';
      }).join('');
    }
    var n2 = $('coachMemN2'); if(n2) n2.textContent = String(a.length);
  }
  function renderCtx(){
    if(!$('coachCtxBar')) return;
    var n = ctxTurns();
    var pct = Math.min(100, Math.round(n / CTX_TURN_FULL * 100));
    var bar = $('coachCtxBar');
    bar.style.width = pct + '%';
    var wrap = $('coachCtxBarWrap');
    if(wrap) wrap.setAttribute('aria-valuenow', String(pct));
    var tn = $('coachCtxTurn'); if(tn) tn.textContent = n + ' 轮';
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
  /* 折叠状态：复用站内存量DATA.settings.coachCtxCollapsed + hubSave()，与侧边栏收起同一套云同步机制 */
  function ctxApplyState(){
    var col = !!DATA.settings.coachCtxCollapsed;
    var aside = $('coachCtx'); if(!aside) return;
    aside.classList.toggle('coach-ctx-mini', col);
    var btn = $('coachCtxToggle');
    if(btn) btn.setAttribute('aria-expanded', col ? 'false' : 'true');
    var tx = $('coachCtxToggleTx');
    if(tx) tx.textContent = col ? '上下文' : '收起';
    var ch = $('coachCtxChev');
    if(ch) ch.textContent = col ? '‹' : '›';
  }
  function ctxToggle(){
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
    var more = $('coachCtxMore');
    if(more) more.addEventListener('click', openMem);
  }

  /* ============ 骨架构建（懒：第一次切到陪练 tab 才建，整页生命周期只建一次） ============ */
  function build(){
    var view = $('coachView');
    if(!view) return;
    /* 10/3 B→A 版重设计：#coachWrap 由「单列居中」改为「三栏 flex 容器」。
       聊天列 #coachCol 左（自适应），上下文栏 #coachCtx 右（可折叠）。
       记忆弹层 #coachMemPop 移出 #coachWrap —— 避免被三栏的 overflow/flex 影响定位。 */
    view.innerHTML =
      '<div id="coachWrap">'
      + '<div id="coachCol">'
      +   '<div id="coachTop">'
      +     '<button id="coachMemBtn" type="button" class="coach-mem-btn" aria-haspopup="dialog">长期记忆 <span id="coachMemN">0</span></button>'
      +   '</div>'
      +   '<div id="coachScroll" aria-live="polite"></div>'
      +   '<div id="coachBar"><div id="coachBarInner">'
      +     '<textarea id="coachInput" rows="1" maxlength="2000" placeholder="说英语，或直接下指令"></textarea>'
      +     '<button id="coachSend" type="button">发送</button>'
      +   '</div></div>'
      + '</div>'
      /* 上下文栏：常驻，桌面展开/可折叠成40px 竖条；≤860 用 CSS 整体隐藏（退化为单列）。
         刻意放在 #coachScroll 之外 —— scroll 内是动态追加的聊天流，塞进去会被对话推走。 */
      + '<aside id="coachCtx" class="coach-ctx" aria-label="本轮上下文">'
      +   '<button type="button" id="coachCtxToggle" class="coach-ctx-toggle" aria-expanded="true" aria-controls="coachCtxBody" title="收起/展开上下文">'
      +     '<span id="coachCtxChev" aria-hidden="true">›</span><span class="coach-ctx-toggle-tx" id="coachCtxToggleTx">收起</span>'
      +   '</button>'
      +   '<div id="coachCtxBody" class="coach-ctx-body">'
      +     '<div class="coach-ctx-card">'
      +       '<div class="coach-ctx-t">本轮</div>'
      +       '<div class="coach-ctx-row"><span>模式</span><b id="coachCtxMode">自由对话</b></div>'
      +       '<div class="coach-ctx-row"><span>目标</span><b id="coachCtxGoal">6.0 · 口语 5.5</b></div>'
      +       '<div class="coach-ctx-row"><span>已练</span><b id="coachCtxTurn">0 轮</b></div>'
      +       '<div class="coach-ctx-bar" id="coachCtxBarWrap" role="progressbar" aria-label="本轮进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="coachCtxBar"></i></div>'
      +       '<div class="coach-ctx-row coach-ctx-time"><span>时长</span><b id="coachCtxTime">0′00″</b></div>'
      +     '</div>'
      +     '<div class="coach-ctx-t">它记住的</div>'
      +     '<div class="coach-ctx-card">'
      +       '<ul class="coach-ctx-mem" id="coachCtxMem"><li class="coach-ctx-empty">还没记住什么 · 多聊几轮就会出现在这里</li></ul>'
      +       '<button type="button" id="coachCtxMore" class="coach-ctx-more">全部记忆<span id="coachMemN2">0</span> →</button>'
      +     '</div>'
      +   '</div>'
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
    var ta = $('coachInput');
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

    $('coachMemBtn').addEventListener('click', openMem);
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

    /* 首次进陪练：本地问候 + chips（不耗 AI 调用） */
    if(!st.greeted){
      st.greeted = true;
      appendHtml(assistantHtml(GREETING));
      st.thread.push({ role: 'assistant', text: GREETING });
      appendHtml(chipsHtml());
    }
    scrollBottom();
    try{ ta.focus(); }catch(_){}
  }

  /* speaking.js 三个 PRACTICE 入口统一调它：首次建骨架，之后只保状态 */
  window.__coachShow = function(){
    if(!st.built || !$('coachWrap')) build();
  };
})();
