/* js/wd-dict.js — 单词听写打字层（WD-DICT-IMMERSIVE-1 · 11-17）
   形态参考她点头的 design/UI-SURVEY-1115/听写-沉浸式-1117.html：
   听发音 → 横线输入 → 回车提交；错误显示正确答案，继续输入即清空重打。
   · 逐键音默认机械键盘（sfx/mechanical/*.wav，与句子打字站同一套素材）
   · 判题/SRS/短线重复/统计/进度全部走 practice.js 既有 judge()，本文件只做输入与反馈。
   · 顶层零 const/let 导出污染：全部挂 window.WD_DICT（PRECORE 无顶层 const 纪律）。 */
(function(){
  'use strict';
  if (window.WD_DICT) return;                       // 软导航重复 eval 幂等

  /* 打字音效表：素材与句子打字站 KEY_SOUNDS 同源（tables.js:217） */
  var KEY_SOUNDS = {
    bubble:     { files: ['sfx/bubble/1.wav','sfx/bubble/2.wav','sfx/bubble/3.wav','sfx/bubble/4.wav',
                          'sfx/bubble/5.wav','sfx/bubble/6.wav','sfx/bubble/7.wav','sfx/bubble/8.wav','sfx/bubble/enter.mp3'],
                  normalKeyCount: 8, keyTypeMap: { enter: 8, space: 5, backspace: 6 } },
    mechanical: { files: ['sfx/mechanical/1.wav','sfx/mechanical/2.wav','sfx/mechanical/3.wav','sfx/mechanical/4.wav','sfx/mechanical/5.wav'],
                  normalKeyCount: 4, keyTypeMap: { enter: 4 } },
    default:    { files: ['sfx/keys/default.mp3'], normalKeyCount: 1, keyTypeMap: {} }
  };
  var KEY_VOL_DEF = { default: 100, mechanical: 60, bubble: 70 };

  var pool = {};                                    // 每类音效各自的 Audio 池
  function keyAudio(type){
    if(!pool[type]) pool[type] = KEY_SOUNDS[type].files.map(function(f){
      var a = new Audio(f); a.preload = 'auto'; return a;
    });
    return pool[type];
  }
  var lastClick = 0;
  /* 只在这些键上响（与句子站 keyIsTyping 同口径） */
  function keyIsTyping(k){
    return k.indexOf('Ctrl') < 0 && k.indexOf('Alt') < 0 &&
      (/^[a-z0-9]$/i.test(k) || ['Backspace',' ','\'','Enter','-'].indexOf(k) >= 0);
  }
  /* 逐键音：60ms 连按节流；Enter/Space/Backspace 走 keyTypeMap 指定索引 */
  function keyClick(rawKey, type){
    if(!keyIsTyping(rawKey)) return;
    var t = KEY_SOUNDS[type] ? type : 'default';
    var now = performance.now();
    if(now - lastClick < 60) return;
    lastClick = now;
    var vol = KEY_VOL_DEF[t] / 100;
    try{
      var table = KEY_SOUNDS[t];
      var mapped = (rawKey === 'Enter') ? table.keyTypeMap.enter
        : (rawKey === ' ') ? table.keyTypeMap.space
        : (rawKey === 'Backspace') ? table.keyTypeMap.backspace : undefined;
      var idx = (mapped != null) ? mapped : Math.floor(now / 60) % table.normalKeyCount;
      var a = keyAudio(t)[idx] || keyAudio(t)[0];
      if(a){ a.volume = vol; a.currentTime = 0; a.play().catch(function(){}); }
    }catch(e){}
  }
  var fbPool = {};
  function fb(file){
    try{
      if(!fbPool[file]){ var a = new Audio(file); a.preload = 'auto'; fbPool[file] = a; }
      fbPool[file].volume = 0.9; fbPool[file].currentTime = 0;
      fbPool[file].play().catch(function(){});
    }catch(e){}
  }

  /* ---------- SLIM-2（11-04）：进题建 Audio 池 ----------
     病根（B1 线上实测 + 源码定位）：keyAudio(type) 是懒建池（第 30 行）——
       第一个键按下才 new Audio(9 个文件)，浏览器这时才开始「取缓存 → 解码 → 可播」，
       她那边看到的就是「打字没声音」，实测首键 544~4665ms。
     ⚠️ 只 fetch 是无效的（第一版这么写的，被 B1 当场否掉）：
       bubble 9 + correct + error 本来就在 install 47 条里，缓存命中是必然的，
       fetch 不会填充 Audio 池，瓶颈在元素创建与解码，不在有没有缓存。
     做法：mount 时提前把池子建好 —— 只是「提前调用」既有的 keyAudio / fbPool 建池路径，
       keyAudio 的函数体、keyClick 的节流/索引/音量映射、fb 的播放逻辑 **一行未改**。
       行为零变化：她按键时拿到的仍是同一个池、同一个索引、同一个音量。
     同一会话每种音色只预热一次（她中途在设置里换音色，下次 mount 会预热新音色）。
     全程 try/catch：预热失败绝不影响听写流程。 */
  var _warmed = {};
  function warmKeys(type){
    try{
      var t = KEY_SOUNDS[type] ? type : 'mechanical';
      if(_warmed[t]) return;
      _warmed[t] = 1;
      var all = keyAudio(t).slice();                 // ← 建池：提前 new 9 个 Audio（preload=auto 自动开拉）
      var fbs = ['sfx/correct.mp3','sfx/error.mp3'];  // 判对/判错的反馈音同链路，一并建池
      for(var j = 0; j < fbs.length; j++){
        if(!fbPool[fbs[j]]){ try{ var a = new Audio(fbs[j]); a.preload = 'auto'; fbPool[fbs[j]] = a; }catch(_){} }
        if(fbPool[fbs[j]]) all.push(fbPool[fbs[j]]);
      }
      /* 静音 play 一下逼出解码：preload='auto' 只保证「有数据」，真正 decode 要等 play。
         实测：只建池不解码，首键仍 186ms；解码后首键 1~10ms（3 次独立复测）。
         volume=0 起播 —— 她听不到任何声音。收尾统一走「只收预热态」的守卫：
           if(el.volume === 0 && !el.paused) el.pause();
         绝不能无条件 pause（B2 抓的竞态）：keyClick 与她打字共用同一个 Audio 对象，
           她进题 500ms 内开始打字是常态，无脑 pause 会把她那一键的声音吃掉。
         currentTime 一律不在这里碰 —— 会截断她正在播的那一键，交给 keyClick 每次 play 前自己设。
         自动播放策略拦截时 play() 会 reject，静默吞掉，不影响任何后续行为。
         ⚠️ P3 挂账（B2 11-04）：这里拿 volume===0 当「预热态」哨兵，是借了
           KEY_VOL_DEF 里没有 0 这个巧合。将来若加「静音」音量档（某音色配成 0），
           守卫会永久失效（元素永远被判成预热态、每次 500ms 都被 pause）。
           更稳的写法是独立标记位（el.dataset.warm='1'，keyClick 里 delete）。今晚不动，白天排。 */
      for(var i = 0; i < all.length; i++){
        (function(el){
          try{
            el.volume = 0;
            var p = el.play();
            /* ⚠️ then 里同样不能无条件 pause（与 500ms 定时器同一个病，B2 只抓了定时器那处）：
               play() 的 promise 可能在她按键之后才 resolve，那一下 pause 一样会吃掉她那一键。
               统一判据：volume 仍是 0 = 还是预热态 → 收；已被 keyClick 设成 0.7/0.6 → 不碰。 */
            if(p && p.then){
              p.then(function(){
                try{ if(el.volume === 0 && !el.paused) el.pause(); }catch(_){}
              }).catch(function(){
                try{ if(el.volume === 0 && !el.paused) el.pause(); }catch(_){}
              });
            }
            /* 11-04 B2 P2：大 wav 在慢设备上解码可能数秒，promise 长时间不 resolve 时
               元素会一直处于 play 状态 —— volume=0 她听不见，但 11 个元素同时占音频通道。
               ⚠️ 绝不能无条件 pause（B2 抓出的竞态）：keyClick 用的是同一个 Audio 对象，
               她进题 500ms 内开始打字是常态，无脑 pause 会把她那一键的声音吃掉。
               判据：volume 仍是 0 = 还是预热态 → 收掉；keyClick 一 play 就设 0.7/0.6，判断即时失效。
               currentTime 也不在这里写 —— 会截断她正在播的那一键，交给 keyClick 自己每次 play 前设。 */
            setTimeout(function(){
              try{ if(el.volume === 0 && !el.paused) el.pause(); }catch(_){}
            }, 500);
            /* 11-04 领头牛批的 P2 兜底：慢设备解码可能拖到数秒，promise 迟迟不 resolve 时
               元素会一直占着音频通道（volume=0 她听不见，但 11 个元素同时在播）。
               3 秒后再收一次 —— 仍按 volume===0 判「还是预热态」，她按键后 volume 变 0.6/0.7 就不碰。
               为什么不无条件 pause：同一个 Audio 对象与 keyClick 共用，她进题 500ms~3s 内打字是常态。 */
            setTimeout(function(){
              try{ if(el.volume === 0 && !el.paused) el.pause(); }catch(_){}
            }, 3000);
          }catch(_){}
        })(all[i]);
      }
      /* ===== 11-04 T13-AUDIOPUT-1（她拍板「修」）：显式落缓存，不依赖 SW 顺带写 =====
         为什么必须有这一段：部署 bump 之后第一轮，SW 缓存刚被清空、浏览器 HTTP 缓存还在。
         media 元素发请求时本就带 `Range: bytes=0-`（元素初始化就带，与 HTTP 缓存无关）；
         文件已在 HTTP 缓存里时，该 Range 请求由缓存层本地切片并返回 206
         → `cache.put` 在规范层直接抛
         TypeError（Partial response (status code 206) is unsupported）→ 落不了缓存 →
         她更新后第一次断网用听写，打字音就是哑的。实测证据：fromSW:true + 5 条 206 + 缓存 0/5。
         ⚠️ 三条硬约束，改这段的人一条都别动：
           ① `fetch(u)` 不带任何 Range 头 —— 一加必回 206，前功尽弃（无 Range 永远是 200 全量）。
           ② 只 `c.put` status===200 的响应 —— 206 会让 put 抛异常，必须挡在 put 之前。
           ③ 每条单独 `.catch` —— 一条失败绝不能打断后面几条，否则建池也断了，首键跟着变慢（倒退）。
         与上面的「建池 + 静音 play 逼解码」是**并行两条路**，不是替换：
           那条路保「首键快」（判据 6 ≤150ms），这条路保「断网也有声」，互不依赖。 */
      var _warmCacheTry = 0;
      (function warmCache(){
        try{
          if(typeof caches === 'undefined' || !caches.open) return;
          var urls = [];
          var files = KEY_SOUNDS[t].files;
          for(var n = 0; n < files.length; n++) urls.push('/' + files[n]);
          urls.push('/sfx/correct.mp3', '/sfx/error.mp3');   // 判对/判错的反馈音同链路
          caches.keys().then(function(keys){
            var curKeys = [];
            for(var k = 0; k < keys.length; k++){ if(/^ielts-hub-v\d+$/.test(keys[k])) curKeys.push(keys[k]); }
            if(!curKeys.length){
              /* SW 还没装好（首访实测要 8~9 秒才接管）。这时请求根本不经过 SW，谁也不会写缓存。
                 她刚装站那一轮也必须能落上，所以退避重试：6 次 × 2 秒 = 12 秒，覆盖接管窗口
                 （原先 4×2=8 秒刚好差一点点，B2 实测接管要 8858ms）。 */
              if(_warmCacheTry++ < 6) setTimeout(warmCache, 2000);
              return;
            }
            /* 🔴 关键：先等 Audio 建池那批 media 请求跑完（默认 4 秒），再查缓存。
               为什么不立刻查：缓存全空时立刻查一定全是 miss，fetch 一发出去就和 Audio 那条并行，
               最后同一文件下两份（实测 mechanical 5 条 → 10 次请求 / 2.08x）。
               延后之后：Audio 那条能落的已经落上 → 跳过；只有「Audio 拿 206 落不了」的才补一份。
               这样正常环境 1.00x，而部署后首轮那个真问题照样修好。 */
            return new Promise(function(res){ setTimeout(res, 4000); }).then(function(){
              /* 逐条查：任一份匹配缓存里已有就整条跳过。
                 🔴 这一步是 B2 红项的修复 —— 不加的话每次进听写题都可能重下一整份音效：
                    sw.js 无 query 分支是 stale-while-revalidate，caches 命中也会 fetch(req) 并重写，
                    所以裸 fetch 全部是真下载。 */
              return Promise.all(curKeys.map(function(k){
                return caches.open(k).then(function(c){
                  return Promise.all(urls.map(function(u){
                    return c.match(u).then(function(h){ return !!h; }).catch(function(){ return false; });
                  }));
                }).catch(function(){ return []; });
              })).then(function(perCache){
                for(var m = 0; m < urls.length; m++){
                  (function(u, idx){
                    var hasAny = false;
                    for(var q = 0; q < perCache.length; q++){ if(perCache[q] && perCache[q][idx]) { hasAny = true; break; } }
                    if(hasAny) return;                        // 任一缓存已有：不重拉
                    fetch(u).then(function(res){              // ① 不带 Range
                      if(!res || res.status !== 200) return;  // ② 只收 200（206 会让 put 抛异常）
                      /* 全都没有才拉这一次，然后 clone 写进所有匹配缓存：
                         双缓存下必定写进当前版本（防旧版劫持），且只下载一次（不双下载）。 */
                      for(var q2 = 0; q2 < curKeys.length; q2++){
                        (function(kn, body){
                          caches.open(kn).then(function(c2){ return c2.put(u, body); }).catch(function(){});
                        })(curKeys[q2], res.clone());
                      }
                    }).catch(function(){});                   // ③ 单条失败不打断循环
                  })(urls[m], m);
                }
              });
            });
          }).catch(function(){});
        }catch(_){}
      })();
    }catch(e){}
  }

  /* ---------- 听写沉浸区挂载（practice.js 渲染完听写题后调用） ---------- */
  var ACTIVE = null;                                // 当前题目的 UI 控制器

  function fmtIpa(s){
    s = String(s || '').trim();
    if(!s) return '';
    return /^\/.*\/$/.test(s) ? s : '/ ' + s + ' /';
  }

  /* 进度读现成口径：updateWordStats 已把「已完成 / 总数」写进 #statProgress。
     它只是被听写态 CSS 藏起来，不再另算一套 SRS 进度。 */
  function readProgress(){
    var done = 0, total = 0;
    try{
      var txt = String((document.getElementById('statProgress') || {}).textContent || '');
      var m = txt.match(/(\d+)\s*\/\s*(\d+)/);
      if(m){ done = Number(m[1]) || 0; total = Number(m[2]) || 0; }
    }catch(e){}
    if(!total){
      try{
        if(typeof pq !== 'undefined' && pq){
          total = Number(pq.initLen || (pq.queue ? pq.queue.length : 0)) || 0;
          done = Math.min(Number(pq.counted ? pq.counted.size : 0) || 0, total);
        }
      }catch(e){}
    }
    return { done: done, total: total };
  }

  function mount(cur){
    var host = document.getElementById('opts');
    if(!host || !cur) return;
    var answer = String(cur.en || '');
    var ipaText = fmtIpa(cur.ipa);
    host.className = 'opts-grid wdd-stage';
    host.innerHTML =
      '<div class="wdd-zone">' +
        '<div class="wdd-top">' +
          '<div class="wdd-status" id="wddStatus" role="status" aria-live="polite">' +
            '<span class="wdd-status-ic" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path id="wddStatusPath" d="m20 6-11 11-5-5"/></svg>' +
            '</span><span id="wddStatusText"></span>' +
          '</div>' +
          '<div class="wdd-feedback">' +
            '<div class="wdd-answer-card" id="wddAnswerCard" hidden>' +
              '<div class="wdd-answer-label">正确答案</div>' +
              '<div class="wdd-answer-word" id="wddAnswerWord"></div>' +
              '<div class="wdd-answer-ipa" id="wddAnswerIpa"></div>' +
              '<div class="wdd-answer-tip">接着输入，再打一遍</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="wdd-line" id="wddLine">' +
          '<input id="wddInput" class="wdd-real-input" type="text" autocomplete="off" autocapitalize="off" ' +
            'autocorrect="off" spellcheck="false" inputmode="text" aria-label="在横线上打出听到的单词，回车提交">' +
          '<div class="wdd-typed" id="wddTyped" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="wdd-bottom">' +
          '<div class="wdd-ipa" id="wddIpa">' + (ipaText || '&nbsp;') + '</div>' +
          '<div class="wdd-hint" id="wddHint">回车提交</div>' +
          '<button class="wdd-speaker" id="wddSpeaker" type="button" title="再听一遍" aria-label="播放单词发音">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="wdd-foot">' +
        '<div class="wdd-progress-track" aria-hidden="true"><div class="wdd-progress-fill" id="wddProgressFill"></div></div>' +
        '<div class="wdd-progress-text" id="wddProgressText">0 / 0</div>' +
      '</div>';

    var input = document.getElementById('wddInput');
    var typed = document.getElementById('wddTyped');
    var line = document.getElementById('wddLine');
    var hint = document.getElementById('wddHint');
    var status = document.getElementById('wddStatus');
    var statusText = document.getElementById('wddStatusText');
    var statusPath = document.getElementById('wddStatusPath');
    var answerCard = document.getElementById('wddAnswerCard');
    var answerWord = document.getElementById('wddAnswerWord');
    var answerIpa = document.getElementById('wddAnswerIpa');
    var speaker = document.getElementById('wddSpeaker');
    var progressFill = document.getElementById('wddProgressFill');
    var progressText = document.getElementById('wddProgressText');
    var actions = document.querySelector('#practiceBody .answer-btns');
    var state = 'answering';                        // answering | correct | wrong

    /* 听写态不展示「不知道 / 已掌握 / 撤销 / 听写记录」这一行。
       只隐藏，不删节点与事件；非听写模式仍照常用。 */
    if(actions) actions.hidden = true;

    var type = 'mechanical';
    try{
      type = localStorage.getItem('wdd_key_sound') || 'mechanical';
      if(!KEY_SOUNDS[type]) type = 'mechanical';
    }catch(e){}
    warmKeys(type);

    function setStatus(kind, text){
      status.classList.remove('good', 'bad', 'show');
      if(!kind || !text) return;
      status.classList.add(kind === 'good' ? 'good' : 'bad', 'show');
      statusText.textContent = text;
      statusPath.setAttribute('d', kind === 'good' ? 'm20 6-11 11-5-5' : 'M6 6l12 12M18 6 6 18');
    }

    function renderTyped(){
      typed.textContent = input.value || '';
      var caret = document.createElement('span');
      caret.className = 'wdd-caret';
      typed.appendChild(caret);
      hint.classList.toggle('show', state === 'answering' && !!input.value);
      line.classList.toggle('wrong', state === 'wrong');
      line.classList.toggle('correct', state === 'correct');
    }

    function updateProgress(){
      var p = readProgress();
      var pct = p.total ? Math.min(100, p.done / p.total * 100) : 0;
      progressFill.style.width = pct + '%';
      progressText.textContent = p.done + ' / ' + p.total;
    }

    function focusInput(){
      try{ input.focus({ preventScroll: true }); }catch(e){ try{ input.focus(); }catch(_e){} }
    }

    function unlockForRetry(){
      state = 'answering';
      input.value = '';
      input.readOnly = false;
      answerCard.hidden = true;
      setStatus('', '');
      line.classList.remove('wrong', 'correct');
      try{
        if(typeof pq !== 'undefined' && pq){
          pq.revealed = false;
          pq._picked = false;
          pq._qStartAt = Date.now();
          clearTimeout(pq._holdTimer);
          pq._holdTimer = null;
          pq._holdCur = null;
        }
      }catch(e){}
      var warea = document.querySelector('#practiceBody .practice-word-area');
      if(warea) warea.classList.remove('pw-reveal');
      var ub = document.getElementById('unknownBtn');
      if(ub){ ub.disabled = false; ub.style.pointerEvents = ''; }
      renderTyped();
      focusInput();
    }

    function afterJudge(ok){
      if(ok){
        state = 'correct';
        input.readOnly = true;
        answerCard.hidden = true;
        setStatus('good', '正确');
      }else{
        state = 'wrong';
        input.readOnly = false;
        answerWord.textContent = answer;
        answerIpa.textContent = ipaText;
        answerCard.hidden = false;
        setStatus('bad', '不对');
      }
      renderTyped();
      updateProgress();
      if(!ok) focusInput();
    }

    function judgeNow(){
      if(state === 'correct') return;
      var val = input.value.trim();
      if(!val) return;
      var ok = val.toLowerCase() === answer.toLowerCase();
      fb(ok ? 'sfx/correct.mp3' : 'sfx/error.mp3');
      try{
        if(typeof window.__wdJudge === 'function') window.__wdJudge(cur, val, ok, false);
      }catch(e){ try{ console.error('[wd-dict] judge failed', e); }catch(_e){} }
    }

    function unknownAnswer(){
      if(state === 'correct') return;
      if(state === 'wrong') unlockForRetry();
      input.value = '';
      renderTyped();
      fb('sfx/error.mp3');
      try{
        if(typeof window.__wdJudge === 'function') window.__wdJudge(cur, null, false, true);
      }catch(e){}
    }

    input.addEventListener('keydown', function(e){
      var k = e.key;
      if(k === 'Enter'){
        e.preventDefault();
        keyClick('Enter', type);
        if(state === 'wrong'){ unlockForRetry(); return; }
        if(state === 'correct') return;
        judgeNow();
        return;
      }
      if(state === 'wrong' && !e.ctrlKey && !e.metaKey && !e.altKey){
        if(k === 'Backspace'){
          e.preventDefault();
          unlockForRetry();
          keyClick('Backspace', type);
          return;
        }
        if(k && k.length === 1) unlockForRetry();
      }
      if(k === 'Backspace'){ keyClick('Backspace', type); return; }
      if(k === ' '){ keyClick(' ', type); return; }
      keyClick(k, type);
    });
    input.addEventListener('input', renderTyped);

    line.addEventListener('pointerdown', function(e){
      if(!e.target.closest('button,a,input')) focusInput();
    });
    speaker.addEventListener('click', function(){
      speaker.classList.add('speaking');
      setTimeout(function(){ speaker.classList.remove('speaking'); }, 1700);
      var qs = document.getElementById('qSpeaker');
      if(qs) qs.click();
    });

    ACTIVE = { afterJudge: afterJudge, unknown: unknownAnswer };
    renderTyped();
    updateProgress();
    setTimeout(focusInput, 60);
  }

  function afterJudge(_cur, ok){
    if(ACTIVE && ACTIVE.afterJudge) ACTIVE.afterJudge(ok);
  }
  function unknown(){
    if(ACTIVE && ACTIVE.unknown) ACTIVE.unknown();
  }

  window.WD_DICT = {
    mount: mount, afterJudge: afterJudge, unknown: unknown,
    keyClick: keyClick, fb: fb, KEY_SOUNDS: KEY_SOUNDS, warmKeys: warmKeys
  };
})();
