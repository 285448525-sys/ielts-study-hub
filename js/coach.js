/* === AI 口语陪练 coach（口语陪练coach_施工方案_2026-10-02）===
   接管口语页「陪练」tab（原句型闯关入口，旧引擎文件全保留，去本 script 引用即回滚）。
   AI 当老师手握 SPEAKING_BANK 出题 → 她作答 → 全纠（必改+更地道完整版）→ 下一题。

   结构铁律（照 sentence-drill.js 成熟模式）：
   - window.__COACH_ON 必须文件顶层先立（defer 按文档序执行，speaking.js tab 分支读它）；
   - 状态挂 window.__coachState 跨软导航；IIFE 重入只防重复绑定，DOM 没了就重建骨架；
   - 按钮走 id + addEventListener（只在 build 时绑一次），不写 inline onclink；
   - 抽题永远在前端（AI 不选卡不选题，题库更新不用动 prompt）；AI 只做纠错/掌握判定/下题思路关键词；
   - Work 卡就业题前端硬黑名单（学员是大学生，prompt 铁律 4 的代码级兜底）；
   - 会话只留内存，P0 不写 DATA（无 mergeData 登记风险，刷新即新会话）。 */
window.__COACH_ON = true;
(function(){
  if(window.__coachBooted) return;
  window.__coachBooted = true;

  /* ============ 常量（必须在 ready 前，本文件不经 ready 也行：全部调用都在用户交互后） ============ */
  var FREQ_ORDER = { ultra:0, high:1, medium:2, low:3 };
  var FREQ_ZH = { ultra:'超高频', high:'高频', medium:'中频', low:'低频' };
  var MAX_CARD_Q = 8;          // P1 单卡兜底上限（AI 一直判未掌握也强制进卡，防卡死）
  var HIST_KEEP = 12;          // 历史窗口（轮）：system + 最近 12 轮 + 当前题面，防一晚上百轮爆 token
  var COACH_SERVICE = 'speaking_coach';

  /* 铁律 4 的代码兜底：Work 卡里 3 句就业题对学生身份不成立，前端直接不抽
     （"Are you looking forward to working?" 保留——学生可答）。改题库时按精确串匹配。 */
  var WORK_BLOCK = [
    'What work do you do?',
    'Why did you choose to do that type of work (or that job)?',
    'Do you want to change to another job?'
  ];

  var COACH_SYS = [
    '你是郭润芝（之之/Camille）的雅思口语陪练老师，目标 5.5 分（机考，P1/P2/P3），考试 10/9。',
    '',
    '【学员档案】',
    '- 身份：大学生（计算机应用专业），杭州人，家乡在浙江农村/小城市，住学校宿舍，ADHD（服用专注达）。',
    '- 水平：上次实考口语 5.0（发音约 6，最大失分点是 P2 连贯性卡顿）。',
    '- 已熟练表达（跳过不教）：I\'m into / I enjoy / I really like。',
    '- 高频语法弱点（纠错时重点盯）：冠词（in the morning / in the area / the countryside）、',
    '  三单 -s（it depends / shops have / TikTok appeals）、动名词（be used to doing / be into doing /',
    '  enjoy doing——这些 to/介词后面必须 doing）、过去分词（haven\'t done）、介词（on weekdays / far from）。',
    '',
    '【绝对铁律——违反任何一条都是事故】',
    '1. 练习阶段绝不给英文参考句/英文答案。只给：题面英文 + 中文意思 + 中文答法提示（关键词/逻辑链）。',
    '   英文完整版只在你纠错时作为【更地道】给出（她答完之后），或她主动说"示范"时。',
    '2. 一次只出 1 道题。她答完 → 你纠 → 出下一题。绝不一次给多题。',
    '3. 她没回答的题绝对不能跳过。',
    '4. 出题逻辑自洽：她是学生 → 永远不问 What work do you do / Why did you choose that job 类工作题，',
    '   工作类卡只出 "Are you looking forward to working?" 这种学生可答的。',
    '5. 不纠标点、大小写、空格、语音识别误差、typo——她用语音输入，你听的是口语不是作文。',
    '   但语法/用词/结构错误必须全纠。',
    '6. 纠错 = 两层，缺一不可：',
    '   【必改】列出该句全部语法/结构错误（原文 → 改正，一句一个点）',
    '   【更地道】给出整句完整地道版（5.5 档：初中词汇、短句、1-2 个连接词，不堆从句生僻词）',
    '   完整地道版必须写完整，她会照着读两遍再进下一题。',
    '7. 表达升级：她用了太基础的表达（I like / I don\'t like）时，在【更地道】里替换成',
    '   I\'m really into X / X appeals to me / I\'m not really into X 等进阶说法，但难度锁 5.5 档。',
    '8. 每条句型/每个话题卡约 5 题测掌握；掌握（大部分句子结构说对）才进下一条；没掌握就继续出同类题。',
    '9. 简洁：不寒暄、不复述她的话、每轮输出不啰嗦。正反馈要具体（好在哪一句），她答得好时明确表扬。',
    '',
    '【P1 模式流程】',
    '1. 从题库按频次选卡 → 出该卡的一个问句：题面英文 + 中文意思 + （可选）中文思路关键词。',
    '2. 她作答 → 全纠（【必改】+【更地道】完整版）→ 正确率反馈 → 下一题。',
    '3. 一张卡 5-8 题，自然过渡到下一张卡（超高频优先）。',
    '',
    '【P2 模式流程】',
    '1. 给出 cue card：题目英文 + 中文意思 + youShouldSay 的 4 个小问（中文翻译）。',
    '2. 她**连讲**（考场是连续讲 2 分钟，练的是逻辑线不是语法）。',
    '3. 纠错重点：FC（连贯性）> 语法。指出她有没有"线"：每个点后面有没有 because/so/and I felt 跟进。',
    '   碎片并列（罗列名词短语）是她的老毛病，必须点名。',
    '4. 语法层仍用【必改】+【更地道】完整版（P2 的更地道版给一段连贯的完整示范回答，不是单句）。',
    '',
    '【接口约定——最高优先级，必须遵守】',
    '- 题目由考试系统从真题库选定后发给你（见用户消息【当前题目】）。你严禁自己另出英文题、严禁改写题面；',
    '  工作类禁题系统已在前端过滤，你也永远不要在反馈里诱导她答就业题。',
    '- 每轮只返回一个 JSON 对象，禁止输出 JSON 之外的任何文字，字段：',
    '  must_fix：字符串数组，每条一个错点，格式"原文 → 改正"；没有必改项给 []。',
    '  natural_version：完整地道版字符串（P1 给整句、P2 给一段连贯示范）；她答得好也要给润色后的完整版。',
    '  praise：具体表扬（好在哪一句），没有给空字符串。',
    '  cn_hint：下一题的中文思路关键词（10-30 字，给关键词/逻辑链不给英文整句），没有可给的就空字符串。',
    '  done：布尔。P1 模式她已基本掌握本卡句型（约 5 题后、大部分结构说对）才给 true，没掌握给 false；',
    '  P2 模式一张卡只连讲一次，反馈后即换下一张，恒给 true。'
  ].join('\n');

  /* ============ 状态（挂 window 跨软导航；刷新页面自然清空=新会话，P0 符合预期） ============ */
  var st = window.__coachState || (window.__coachState = {
    mode:'P1',
    built:false,
    history:[],          // [{role:'user'|'assistant', text}] 教学摘要（user 含题面+作答）
    cursor:{ P1:0, P2:0 },
    card:null,           // 当前 SPEAKING_BANK 卡
    used:{},             // 本卡已出问句的原数组下标（P1）
    qno:0,               // 卡内已出题数
    hint:'',             // AI 给下一题的中文思路关键词
    cur:null,            // 当前题 {en, zh, isP2, yss:[4]}
    phase:'ask',         // ask | busy | review
    advance:false        // 点「下一题」时是否换卡
  });

  /* ============ 纯逻辑（挂 window.__coachInternal 供探针直测） ============ */
  function orderedCards(mode){
    var list = SPEAKING_BANK.filter(function(c){ return c.type === mode; })
      .map(function(c, i){ return { c:c, i:i }; });
    // 频次优先（ultra→low），同频次保持题库原序（稳定排序）
    list.sort(function(a, b){
      var fa = FREQ_ORDER[a.c.frequency] === undefined ? 9 : FREQ_ORDER[a.c.frequency];
      var fb = FREQ_ORDER[b.c.frequency] === undefined ? 9 : FREQ_ORDER[b.c.frequency];
      if(fa !== fb) return fa - fb;
      return a.i - b.i;
    });
    return list.map(function(x){ return x.c; });
  }

  function availableIdx(card){
    return card.questions.map(function(_, i){ return i; }).filter(function(i){
      if(card.id === 'sb_p1_work' && WORK_BLOCK.indexOf(card.questions[i]) !== -1) return false;
      return true;
    });
  }

  /* 选当前卡的下一道题（P1）；同卡不重复，出尽后从头循环。返回 null 表示该卡无题可出。 */
  function pickP1(card, used){
    var avail = availableIdx(card);
    if(!avail.length) return null;
    var fresh = avail.filter(function(i){ return !used[i]; });
    var pool = fresh.length ? fresh : avail.slice();
    if(!fresh.length) st.used = used = {};   // 出尽：重置已出标记从头再来
    var idx = pool[0];
    used[idx] = true;
    return card.questions[idx];
  }

  /* 推进并出下一道题；forceAdvance=true 时直接换下一卡（P2 恒换、P1 掌握/满 8 题换）。 */
  function nextQuestion(forceAdvance){
    var cards = orderedCards(st.mode);
    if(!cards.length) return false;
    var changeCard = !st.card || forceAdvance;
    if(changeCard){
      if(forceAdvance && st.card){
        st.cursor[st.mode] = (st.cursor[st.mode] + 1) % cards.length;
      }
      st.card = cards[st.cursor[st.mode] % cards.length];
      st.used = {};
      st.qno = 0;
      st.hint = '';
    }
    if(st.mode === 'P2'){
      st.qno += 1;
      var c2 = st.card;
      st.cur = { en:c2.promptEn, zh:c2.promptZh, isP2:true, yss:(c2.youShouldSay || []).slice() };
      st.advance = true;   // P2 一张卡连讲一次，反馈后永远进下一张
      return true;
    }
    var q = pickP1(st.card, st.used);
    if(q === null){
      st.card = null;      // 空卡兜底：换下一卡
      return nextQuestion(true);
    }
    st.qno += 1;
    st.cur = { en:q, zh:st.card.titleZh, isP2:false, yss:[] };
    st.advance = (st.qno >= MAX_CARD_Q);
    return true;
  }

  function progressText(){
    if(!st.card) return '';
    var fz = FREQ_ZH[st.card.frequency] || '';
    if(st.mode === 'P2'){
      return '第 ' + (st.cursor.P2 + 1) + ' 张 cue 卡 · ' + fz + ' · ' + st.card.category;
    }
    return st.card.titleEn + ' 卡 · 第 ' + st.qno + ' 题 · ' + fz;
  }

  function userPayload(ans){
    var head = '【当前题目】（' + st.mode + ' · 卡：' + st.card.titleEn + ' / ' + st.card.titleZh
      + ' · ' + (FREQ_ZH[st.card.frequency] || '') + ' · 卡内第 ' + st.qno + ' 题）\n' + st.cur.en;
    if(st.cur.isP2 && st.cur.yss.length){
      head += '\nYou should say:\n- ' + st.cur.yss.join('\n- ');
    }
    if(st.hint) head += '\n【可用中文思路关键词】' + st.hint;
    return head + '\n【学员作答】\n' + ans;
  }

  function assistantDigest(j){
    if(!j || typeof j !== 'object') return '';
    var p = [];
    if(j.praise) p.push('老师表扬：' + j.praise);
    if(j.must_fix && j.must_fix.length) p.push('必改点：\n- ' + j.must_fix.join('\n- '));
    if(j.natural_version) p.push('地道版本：' + j.natural_version);
    return p.join('\n');
  }

  window.__coachInternal = {
    orderedCards:orderedCards, availableIdx:availableIdx, pickP1:pickP1,
    /* _next：纯推进（false=同卡下一题，true=换下一卡），不重置当前卡；
       start：重置游标卡状态后从当前模式游标卡出首题 */
    nextQuestion:function(force){ return nextQuestion(!!force); },
    start:function(){ st.card = null; st.used = {}; st.qno = 0; st.hint = ''; st.cur = null; st.advance = false; return nextQuestion(false); },
    progressText:function(){ return progressText(); },
    state:st, WORK_BLOCK:WORK_BLOCK
  };

  /* ============ 渲染 ============ */
  function $(id){ return document.getElementById(id); }

  function scrollBottom(){
    var sc = $('coachScroll');
    if(sc) sc.scrollTop = sc.scrollHeight;
  }

  function questionCardHtml(){
    var c = st.cur, tag, body;
    if(!c) return '';
    if(c.isP2){
      tag = '<span class="cq-part">P2 连讲</span><span class="cq-freq">' + escapeHtml(FREQ_ZH[st.card.frequency] || '') + '</span>';
      body = '<div class="cq-en">' + escapeHtml(c.en) + '</div>'
        + '<div class="cq-zh">' + escapeHtml(c.zh || '') + '</div>'
        + (c.yss.length ? '<ul class="cq-yss">' + c.yss.map(function(y){ return '<li>' + escapeHtml(y) + '</li>'; }).join('') + '</ul>' : '')
        + '<div class="cq-tip">像考场一样连续讲 2 分钟，把每个点用 because / so / and I felt 接出"线"。</div>';
    }else{
      tag = '<span class="cq-part">P1 句型跟练</span><span class="cq-freq">' + escapeHtml(FREQ_ZH[st.card.frequency] || '') + '</span>';
      body = '<div class="cq-en">' + escapeHtml(c.en) + '</div>'
        + '<div class="cq-zh">话题：' + escapeHtml(c.zh || st.card.titleZh) + '</div>'
        + (st.hint ? '<div class="cq-hint">思路关键词：' + escapeHtml(st.hint) + '</div>' : '');
    }
    return '<div class="cq-card"><div class="cq-tags">' + tag + '</div>' + body + '</div>';
  }

  function userHtml(ans){
    return '<div class="cu-row"><div class="cu-bubble">' + escapeHtml(ans).replace(/\n/g, '<br>') + '</div></div>';
  }

  function feedbackHtml(j, rawFallback){
    if(!j || typeof j !== 'object'){
      // aiJson 解析失败：AI 原文直接进对话流，不报错打断练习
      return '<div class="cf"><div class="cf-raw">' + escapeHtml(String(rawFallback || '')).replace(/\n/g, '<br>') + '</div></div>';
    }
    var h = '<div class="cf">';
    if(j.praise){
      h += '<div class="cf-praise">👍 ' + escapeHtml(j.praise) + '</div>';
    }
    if(j.must_fix && j.must_fix.length){
      h += '<div class="cf-t cf-t-fix">必改</div><ul class="cf-fix">';
      j.must_fix.forEach(function(x){ h += '<li>' + escapeHtml(String(x)) + '</li>'; });
      h += '</ul>';
    }else{
      h += '<div class="cf-ok">这句没有必改的语法/结构错误 ✓</div>';
    }
    if(j.natural_version){
      h += '<div class="cf-t cf-t-nat">更地道 · 照着读两遍</div>'
        + '<div class="cf-nat">' + escapeHtml(j.natural_version).replace(/\n/g, '<br>') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderProgress(){
    $('coachProg').textContent = progressText();
    $('coachM1').classList.toggle('on', st.mode === 'P1');
    $('coachM2').classList.toggle('on', st.mode === 'P2');
  }

  function renderQuestion(){
    var sc = $('coachScroll');
    sc.insertAdjacentHTML('beforeend', questionCardHtml());
    renderProgress();
    scrollBottom();
  }

  function setPhase(p){
    st.phase = p;
    var busy = (p === 'busy');
    $('coachInput').disabled = busy;
    $('coachSend').hidden = (p !== 'ask' && p !== 'busy' ? true : false);
    // busy 时发送按钮置灰显示「纠错中」；ask 正常；review 隐藏发送、亮出下一题
    $('coachSend').disabled = (p !== 'ask');
    $('coachSend').textContent = busy ? '纠错中…' : '发送';
    $('coachNext').hidden = (p !== 'review');
    $('coachNext').disabled = false;
    $('coachNext').textContent = st.advance ? '进入下一张卡 →' : '下一题 →';
    if(p === 'ask'){
      $('coachInput').value = '';
      setTimeout(function(){ try{ $('coachInput').focus(); }catch(_){} }, 0);
    }
  }

  /* ============ 交互流程 ============ */
  function applyFeedback(j, raw){
    var sc = $('coachScroll');
    sc.insertAdjacentHTML('beforeend', feedbackHtml(j, raw));
    if(j && typeof j === 'object'){
      st.history.push({ role:'assistant', text:assistantDigest(j) });
      if(typeof j.cn_hint === 'string' && j.cn_hint.trim()) st.hint = j.cn_hint.trim();
      if(st.mode === 'P1' && j.done === true) st.advance = true;
    }else{
      st.history.push({ role:'assistant', text:String(raw || '').slice(0, 500) });
    }
    st.phase = 'review';
    setPhase('review');
    scrollBottom();
  }

  async function onSend(){
    if(st.phase !== 'ask') return;
    var input = $('coachInput');
    var ans = (input.value || '').trim();
    if(!ans){ toast('先说你的答案，再发给老师'); return; }

    var sc = $('coachScroll');
    sc.insertAdjacentHTML('beforeend', userHtml(ans));
    st.history.push({ role:'user', text:userPayload(ans) });
    scrollBottom();
    setPhase('busy');

    var messages = [{ role:'system', content:COACH_SYS }];
    st.history.slice(-HIST_KEEP).forEach(function(r){ messages.push({ role:r.role, content:r.text }); });

    var content = null, failed = null;
    try{
      content = await callRelay(COACH_SERVICE, messages, 0.7, { max_tokens:1500, json_mode:true });
    }catch(e){
      failed = e;
    }
    if(failed){
      // 失败绝不推进：撤回本轮 user 历史、移除刚渲染的气泡，让她原样重发
      st.history.pop();
      var rows = sc.querySelectorAll('.cu-row');
      if(rows.length) rows[rows.length - 1].remove();
      // 顺序必须 setPhase 在前、回填在后：setPhase('ask') 内部会清空输入框
      st.phase = 'ask';
      setPhase('ask');
      input.value = ans;
      var code = failed && failed.code;
      if(code === 'AUTH_REQUIRED' || code === 'auth_required') toast('请先登录后再用 AI 陪练');
      else if(code === 'user_limit') toast('本周免费 AI 额度用完了，会员不限次（VIP 页开通）');
      else toast('网络异常，没发出去，再试一次');
      return;
    }
    var j = null;
    try{ j = aiJson(content); }catch(_){ j = null; }
    applyFeedback(j, content);
  }

  function onNext(){
    if(st.phase !== 'review') return;
    var adv = st.advance;
    st.advance = false;
    if(!nextQuestion(adv)){ toast('题库还没加载好，稍后再试'); return; }
    st.phase = 'ask';
    renderQuestion();
    setPhase('ask');
  }

  function switchMode(mode){
    if(mode === st.mode) return;
    st.mode = mode;
    st.card = null; st.used = {}; st.qno = 0; st.hint = ''; st.cur = null;
    st.history = []; st.advance = false;
    $('coachScroll').innerHTML = '';
    nextQuestion(false);
    st.phase = 'ask';
    renderQuestion();
    setPhase('ask');
  }

  /* ============ 骨架构建（懒：第一次切到陪练 tab 才建） ============ */
  function build(){
    var view = $('coachView');
    if(!view) return;
    view.innerHTML =
      '<div id="coachWrap">'
      + '<div id="coachTop">'
      +   '<div class="coach-seg" role="tablist">'
      +     '<button id="coachM1" class="coach-seg-btn" type="button">P1 句型跟练</button>'
      +     '<button id="coachM2" class="coach-seg-btn" type="button">P2 连讲</button>'
      +   '</div>'
      +   '<div id="coachProg"></div>'
      + '</div>'
      + '<div id="coachScroll" aria-live="polite"></div>'
      + '<div id="coachBar">'
      +   '<div id="coachBarInner">'
      +     '<textarea id="coachInput" rows="1" maxlength="2000" placeholder="用英语作答（也可以用语音输入），说完点发送"></textarea>'
      +     '<button id="coachSend" type="button">发送</button>'
      +     '<button id="coachNext" type="button" hidden>下一题 →</button>'
      +   '</div>'
      + '</div>'
      + '</div>';

    $('coachSend').addEventListener('click', function(){ onSend(); });
    $('coachNext').addEventListener('click', function(){ onNext(); });
    $('coachM1').addEventListener('click', function(){ switchMode('P1'); });
    $('coachM2').addEventListener('click', function(){ switchMode('P2'); });
    var ta = $('coachInput');
    ta.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
        e.preventDefault();
        onSend();
      }
    });
    ta.addEventListener('input', function(){
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
    });

    /* 移动端键盘弹起：visualViewport 上浮底栏（fixed bottom 会被键盘盖住的兜底）。
       off=0（键盘收起）时必须清掉行内值交回 CSS —— 手机端 CSS 底栏锚在 dock 顶（var(--dock-h)），
       写死 0 会让底栏钻到 z-index 更高的 #hubDock 下面（10/2 实测 390px 发送钮被 dock 吃掉点击）。 */
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
    nextQuestion(false);
    st.phase = 'ask';
    renderQuestion();
    setPhase('ask');
  }

  /* speaking.js 三个 PRACTICE 入口统一调它：首次建骨架，之后只保状态 */
  window.__coachShow = function(){
    if(!st.built || !$('coachWrap')) build();
  };
})();
