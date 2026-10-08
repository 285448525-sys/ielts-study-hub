/* 口语模考 · 主控制器（状态机）
   流程：开始卡 → P1(2 必选大题 + 2 非必选大题·每题 3 小题·含开场姓名共 13 个) → P2(准备 1min + 陈述 2min) → P3(3 题 AI 追问，复用 common.js MockGenP3) → 报告
   架构：
   - 输入层：考生直接在页面文本框手写 / 粘贴英文回答（录音 / 语音转写已移除）
   - 大脑层：callRelay → DeepSeek（生成 P3 追问 + 读文字评分）
   - 发音分：只取设置里的固定分（发音评测已移除，不再做讯飞 / AI 估算）
   - 考官窗（10/1 批3）：每场随机 SVG 插画考官 + 名牌；P1/P3 大窗居中，P2 切 #mockStage.p2-mode 两栏
   红线：不碰 callRelay / DATA.scores；发音分走设置；PAGES 只追加 mock；题库只读。 */
(function(){
  let mockState = null;
  /* 10/2 修（二轮审查）：开考/续考入口竞态锁。ensureMockLib() 有最长 2.5s 的脚本注入窗口，
     窗口内重复点「模考」tab、或首次进站自动续考与手动点击并发，会并发起两个 runExam：
     双总计时器、mockState 互相覆盖、舞台状态撕裂 → 卡死只能刷新。
     mockState 就位前用 mockEntering 同步挡重入；mockState 就位后由它接管
     （考完出报告 / 中断 / 退出时置回 null）。 */
  let mockEntering = false;

  /* ---------- 模考进度保持（localStorage 快照，软导航 / 刷新后自动恢复） ----------
     把"已答题目 + 当前阶段 + 题号 + 剩余秒数"序列化到 localStorage，
     离开模考页（软导航或刷新）后再次进入时，从断点自动续考，不重头开始。 */
  const RESUME_KEY = 'ielts_mock_resume_v1';
  function saveResumeSnapshot(phase, index, remaining){
    if(!mockState) return;
    try{
      const snap = {
        v: 1, ts: Date.now(),
        p1Set: mockState.p1Set,
        p2Topic: mockState.p2Topic,
        answers: mockState.answers,
        pronSource: mockState.pronSource,
        p3qs: mockState.p3qs || [],
        examiner: mockState.examiner || null,   // 10/1 批3：考官随快照保存，续考刷新后仍是同一位考官
        notebook: mockState.notebook || '',    // 10/3 23:05：P2 准备阶段的笔记随快照存，续考/刷新不丢
        totalRemaining: mockState.totalRemaining != null ? mockState.totalRemaining : TOTAL_LIMIT,
        phase: phase,
        index: index,
        remaining: (remaining == null ? 0 : remaining)
      };
      localStorage.setItem(RESUME_KEY, JSON.stringify(snap));
    }catch(e){}
  }
  function loadResumeSnapshot(){
    try{
      const raw = localStorage.getItem(RESUME_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || s.v !== 1) return null;
      if(!Array.isArray(s.p1Set) || !s.p2Topic || !Array.isArray(s.answers)) return null;
      if(['P1','P2-prep','P2-talk','P3'].indexOf(s.phase) === -1) return null;
      return s;
    }catch(e){ return null; }
  }
  function clearResumeSnapshot(){ try{ localStorage.removeItem(RESUME_KEY); }catch(e){} }
  /* ---------- 「退出模考」按钮（10/2 改：右下角悬浮红 FAB → 顶部黄条右半部分的实体小按钮） ----------
     退出交互：点按钮 → 弹对话框，三选一：
       · 保存进度并退出：保留 localStorage 快照，返回开始卡（下次进入模考自动续考；同会话也可点「继续上次模考」）
       · 清除记录并退出：清掉快照，返回开始卡
       · 继续模考：关闭对话框，留在当前题
     她原话：不要悬浮状、要实体的、饱和低的橙黄且比黄框深一点、放在黄色框的右半部分、按钮稍小。
     挂进 #mockTotalTimerWrap（黄条）内、用 margin-left:auto 顶到最右；黄条 hidden 时按钮一起隐藏，
     舞台隐藏 / 切 tab / 显示报告时随父级自动消失，不污染其他页面。 */
  /* 9/26 她拍板：点「开始模考」后整页只剩模考内容（隐藏侧栏与 tab 行，见 speaking.html .mock-immerse）。
     出报告 / 中途退出 / 中断 / 切 tab 一律恢复常规布局——否则页面只剩模考且没有 tab 可点会卡死。 */
  function setMockImmerse(on){
    try{ document.body.classList.toggle('mock-immerse', !!on); }catch(e){}
  }
  function injectExitButton(){
    if($('#mockExitBtn')) return;
    const host = $('#mockTotalTimerWrap') || $('#mockStage');
    if(!host) return;
    const b = document.createElement('button');
    b.id = 'mockExitBtn';
    b.type = 'button';
    b.className = 'mock-exit-btn';
    b.setAttribute('aria-label', '退出模考');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg> 退出模考';
    b.onclick = () => showExitModal();
    host.appendChild(b);
  }
  function removeExitButton(){ const b = $('#mockExitBtn'); if(b) b.remove(); }
  function showExitModal(){
    if($('#mockExitModal')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'mockExitModal';
    backdrop.className = 'mock-modal-backdrop';
    backdrop.innerHTML =
      '<div class="mock-modal" role="dialog" aria-modal="true">'
      + '<h3>退出模考？</h3>'
      + '<p class="mock-modal-desc">是否需要保存本次模考进度？保存后，下次进入模考可继续未完成的部分；不保存将清除本次所有答题记录。</p>'
      + '<div class="mock-modal-actions">'
      + '<button class="mock-modal-btn save" id="mockExitSave">保存进度并退出</button>'
      + '<button class="mock-modal-btn clear" id="mockExitClear">不保存，清除记录退出</button>'
      + '<button class="mock-modal-btn cancel" id="mockExitCancel">继续模考</button>'
      + '</div></div>';
    backdrop.addEventListener('click', e => { if(e.target === backdrop) closeExitModal(); });
    document.body.appendChild(backdrop);
    const save = $('#mockExitSave'); if(save) save.onclick = () => { closeExitModal(); exitToStart(true); };
    const clear = $('#mockExitClear'); if(clear) clear.onclick = () => { closeExitModal(); exitToStart(false); };
    const cancel = $('#mockExitCancel'); if(cancel) cancel.onclick = () => closeExitModal();
  }
  function closeExitModal(){ const m = $('#mockExitModal'); if(m) m.remove(); }
  /* 10/2（她拍板）：开始卡已删——退出/中断后直接回「题库」tab（点隐藏 BANK tab 复用全部切换逻辑，
     含解除沉浸/显隐视图；保存的快照下次点「模考」自动续考）。 */
  function exitToBank(){
    try{ const bt = document.querySelector('#tabs [data-type="BANK"]'); if(bt) bt.click(); }catch(e){}
  }
  function exitToStart(save){
    if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
    stopTotalTimer();
    if(!save) clearResumeSnapshot();   // 保存则不清除，保留快照供续考
    removeExitButton();
    setMockImmerse(false);          // 9/26：退出模考 → 恢复常规布局
    setP2Mode(false);               // 10/1 批3：清理两栏模式，下次开考干净入场
    mockState = null;
    $('#mockStage').hidden = true;
    $('#mockReport').hidden = true;
    exitToBank();
    toast(save ? '已保存进度，下次进入模考可继续' : '已清除本次模考记录');
  }
  /* 10/8 修（探针实抓）：视图互斥只在 speaking.js 的 tab 点击处理器里做，
     而「自动续考 / 开始模考」直接显示 #mockView 时**从不藏兄弟视图** →
     #listView 等照常占位叠在模考上层（点击被拦截 / 舞台被挤）。
     这里补上与 tab 处理器同一份互斥名单（speaking.js:240），单一职责：进模考 = 只剩模考。 */
  function showOnlyMockView(){
    ['#listView','#detailView','#matView','#pdView','#sentView','#coachView'].forEach(sel => {
      try{ const el = document.querySelector(sel); if(el) el.hidden = true; }catch(e){}
    });
    const mv = $('#mockView');
    if(mv) mv.hidden = false;
  }

  async function resumeFromSnapshot(){
    if(mockEntering || mockState) return;   // 10/2 修：注入窗口/考试进行中防并发双开
    mockEntering = true;
    const snap = loadResumeSnapshot();
    if(!snap){ mockEntering = false; return; }
    mockState = { p1Set: snap.p1Set, p2Topic: snap.p2Topic, answers: snap.answers, pronSource: snap.pronSource, p3qs: snap.p3qs || [], totalRemaining: (snap.totalRemaining != null ? snap.totalRemaining : TOTAL_LIMIT), notebook: snap.notebook || '' };
    mockEntering = false;   // 10/2 修：状态已同步就位（本行在第一个 await 之前），重入改由 mockState 挡
    // 考官：优先用快照里的（续考不换人）；老快照没有该字段则现场随机补一位
    mockState.examiner = snap.examiner || pickExaminer();
    renderExaminer(mockState.examiner);
    // 10/1 批3 修复：#mockView 默认 hidden，自动续考要同步显容器 + 把 tab 高亮切到「模考」，视觉状态一致。
    // 10/8：改走 showOnlyMockView()（顺带藏掉 tab 默认显示的 #listView，续考不再叠层）
    showOnlyMockView();
    document.querySelectorAll('#tabs .pill-tab').forEach(b => b.classList.toggle('active', b && b.dataset && b.dataset.type === 'MOCK'));
    $('#mockReport').hidden = true; $('#mockStage').hidden = false;
    setMockImmerse(true);           // 9/26：续考也进沉浸
    injectExitButton();
    startTotalTimer();
    toast('已恢复上次未完成的模考，继续答题');
    await ensureMockLib();   // 续考前确保报告库就绪
    await runExam(snap);
  }

  /* ---------- 工具 ---------- */
  function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function sampleOne(a){ return a[Math.floor(Math.random()*a.length)]; }
  function fmtClock(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  function setPhase(t){ const el=$('#mockPhase'); if(el) el.textContent=t; }

  /* ---------- 考官视频窗（10/1 批3 · 她拍板「考官的脸出现在屏幕上」） ----------
     形象 = SVG 插画（img/examiner-*.svg，无肖像权/版权问题；未来可换 AI 实拍图）。
     每场随机一位 + 英文名牌；P1/P3 大窗居中，P2 时 #mockStage 加 p2-mode 切两栏（左题目 + 右小窗）。 */
  /* 10/3 头像选择：新增 2 个 DiceBear avataaars（CC0 免署名），可在设置页「考官的样子」里选。
     选定的那位（window.avExamSrc()）排前面 → 优先被随机到；没选时随机池不变（仍是 4 位）。 */
  const _pickedExam = (typeof window !== 'undefined' && typeof window.avExamSrc === 'function') ? window.avExamSrc() : '';
  const EXAMINERS = [
    { id: 'af', name: 'Sophia Turner', img: 'img/avatars/exam-f.svg' },
    { id: 'am', name: 'Daniel Hughes', img: 'img/avatars/exam-m.svg' },
    { id: 'a', name: 'Emily Carter', img: 'img/examiner-a.svg' },
    { id: 'b', name: 'James Wilson', img: 'img/examiner-b.svg' }
  ];
  /* 选中的考官权重更高：50% 概率优先用ta。没选时退化为纯随机 4 位。 */
  function pickExaminer(){
    if(_pickedExam && Math.random() < 0.5){
      const p = EXAMINERS.find(x => x.img === _pickedExam);
      if(p) return p;
    }
    return sampleOne(EXAMINERS);
  }
  function renderExaminer(ex){
    const img = $('#mockExaminerImg'), nm = $('#mockExaminerName');
    if(!img) return;
    if(ex && ex.img){ img.src = ex.img; img.alt = 'Examiner ' + (ex.name || ''); }
    if(nm) nm.textContent = (ex && ex.name) ? ex.name : 'IELTS Examiner';
    setExaminerState('');
  }
  function setExaminerState(t){
    const el = $('#mockExaminerState');
    if(el) el.textContent = t || '';
  }
  function setP2Mode(on){
    const st = $('#mockStage');
    if(st) st.classList.toggle('p2-mode', !!on);
  }
  /* 10/6 代码质量清理：删掉 setMockStep()。
     它查询的 `#mockSteps .mock-step` 在 speaking.html 与所有 js 里**都不存在**
     （全站 grep 只有这一处引用，也没有任何 .mock-step 的 CSS），
     → querySelectorAll 恒返回空 NodeList，forEach 什么都不做，**不报错**。
     典型的「看起来在工作、实际是空转」的死代码（与 10/6 词库 B2 那类静默失效同族）。
     它原本在 P1/P3 的每题循环里各调一次，等于每题白跑一次无用的全文档查询。 */
  function setMockSubCount(idx, total){
    const el = $('#mockSubCount');
    if(el) el.textContent = 'Q ' + idx + ' / ' + total;
  }

  /* 软导航只 eval js/mock.js，head 里的 mock-report 不会被重新执行，
     故在此动态注入该库（带缓存，避免重复加载），直接访问也有（head defer 已加载）。
     录音 / 语音转写已移除，不再注入 mock-asr.js。 */
  function ensureMockLib(){
    return new Promise(resolve => {
      const done = () => { if(window.MockReport) resolve(); };
      if(window.MockReport) return resolve();
      let pending = 0;
      ['js/mock-report.js'].forEach(src => {
        if(document.querySelector('script[data-mocklib="'+src+'"]')) return;
        pending++;
        // 带 ?v=：跟页面声明同源，避免拿到 HTTP 缓存里的旧副本把新版 MockReport 覆盖回去（9/17）
        const s = document.createElement('script');
        s.src = (typeof declaredSrc === 'function') ? declaredSrc('mock-report.js') : 'js/mock-report.js';
        s.defer = true; s.setAttribute('data-mocklib', src);
        s.onload = () => { pending--; if(pending<=0) done(); };
        s.onerror = () => { pending--; if(pending<=0) done(); };
        document.head.appendChild(s);
      });
      if(pending === 0) done();
      setTimeout(done, 2500); // 兜底：2.5s 后无论如何继续
    });
  }

  /* ---------- 事件委托：报告页「再来一次」----------
     10/2（她拍板）：开始卡/续考按钮已删（点「模考」直达考试，快照自动续考），
     委托只剩报告页重试。仍走 #mockView 委托（软导航/云同步重渲染不丢绑定）。 */
  function bindMockViewDelegation(){
    const view = $('#mockView');
    if(!view || view.__mockDelegated) return;   // 软导航重跑时 #mockView 被替换成新元素，flag 自然失效，不会重复绑定
    view.__mockDelegated = true;
    view.addEventListener('click', e => {
      const retry = e.target.closest('#mockRetryBtn');
      if(retry){
        if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
        startExam();
        return;
      }
    });
  }

  /* ---------- 笔记与回答框 ----------
     10/3 23:05（历史）：① 笔记留屏（存 mockState.notebook，陈述/P3 全程可见）；② 回答框 autoGrow。
     10/8 重做（她拍板）：笔记不再是回答框的镜像 —— 准备阶段 = 独立可编辑小纸条（写关键词），
     「结束准备」后冻结只读、与她的陈述内容完全无关。见 bindNoteEditor / paintNoteForPhase。 */

  function renderMockNote(){
    const box = $('#mockNote'), body = $('#mockNoteBody');
    if(!box || !body) return;
    const txt = ((mockState && mockState.notebook) || '').trim();
    if(!txt){ box.hidden = true; body.textContent = ''; return; }
    body.textContent = txt;
    box.hidden = false;
  }
  /* 文本框自动长高：随内容涨高，能看全自己写的（她报「框不会随文字变化」）。
     上限 maxH（默认 46vh），到顶后内部滚而不是继续撑破布局。 */
  function autoGrowManual(){
    const ta = $('#mockManual');
    if(!ta) return;
    ta.style.height = 'auto';
    const maxH = Math.max(220, Math.round(window.innerHeight * 0.46));
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
  }
  /* 10/8 她拍板重做笔记机制：准备阶段笔记 = 可编辑小纸条（#mockNoteInput，写几个关键词），
     与回答框（#mockManual）完全独立。
     ⚠️ 旧病根（她报「笔记栏和回答栏完全一模一样同步」）：旧版没有独立笔记输入，
     准备阶段把回答框内容实时镜像进 renderMockNote() → 笔记 = 回答，同步变化。
     现在笔记只在准备阶段可写（实时存 mockState.notebook，刷新/续考不丢），
     「结束准备」后冻结只读（#mockNoteBody 显示），陈述/P3 全程可见且不随回答变（10/3 留屏要求保留）。 */
  function bindNoteEditor(){
    const input = $('#mockNoteInput');
    if(!input) return;
    if(input.__noteSaveFn) input.removeEventListener('input', input.__noteSaveFn);
    input.__noteSaveFn = () => { if(mockState) mockState.notebook = input.value; };
    input.addEventListener('input', input.__noteSaveFn);
  }
  /* 笔记显隐按阶段切换：prep = 编辑态；其余 = 冻结只读（有内容才显示，P1 正常场为空 → 整卡隐藏）。 */
  function paintNoteForPhase(isPrep){
    const box = $('#mockNote'), body = $('#mockNoteBody'), input = $('#mockNoteInput');
    if(!box || !body || !input) return;
    if(isPrep){
      input.hidden = false; body.hidden = true;
      input.value = (mockState && mockState.notebook) || '';
      box.hidden = false;
      bindNoteEditor();
    } else {
      input.hidden = true; body.hidden = false;
      renderMockNote();   // 无内容时整卡隐藏（含 P1）
    }
  }
  /* ⚠️ 不用 __mockGrowBound 做一次性守卫：P1 是最先到的阶段（isPrep=false），
     若锁住首次绑定，到 P2 准备阶段 isPrep 就传不进去了 → 边打边存又失效。
     改为每题解绑旧监听再绑新的（askQuestion 每题都调，节点是同一个 textarea）。 */
  function bindManualAutoGrow(){
    const ta = $('#mockManual');
    if(!ta) return;
    if(ta.__mockGrowFn) ta.removeEventListener('input', ta.__mockGrowFn);
    const fn = () => { autoGrowManual(); };
    ta.__mockGrowFn = fn;
    ta.addEventListener('input', fn);
  }

  /* ---------- 单题交互（手动输入文本框，无录音）---------- */
  function askQuestion(opts){
    return new Promise(resolve => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      setPhase(opts.phaseLabel || '');
      // 考官窗状态文案：P2 准备 = 考官在等你打草稿；其余 = 考官正在提问
      setExaminerState(opts.isPrep ? '准备时间 · 考官在等你' : '考官提问中');
      const qEl = $('#mockQ');
      if(qEl){
        if(opts.allowTts){
          // 题目文本 + 播放按钮并排（P1/P3 需要语音；P2 不加）
          qEl.innerHTML = '<div class="mock-q-row">'
            + '<div class="mock-q-text">' + (opts.qHtml || '') + '</div>'
            + ttsBtnHtml()
            + '</div>';
        } else {
          qEl.innerHTML = opts.qHtml || '';
        }
      }
      // 题目语音：渲染后自动朗读一次（用户刚点过“下一题”，属用户手势，浏览器允许）；并绑定重播按钮
      if(opts.allowTts && qEl){
        const ttsBtn = qEl.querySelector('.sp-tts');
        const ttsText = opts.ttsText || (qEl.querySelector('.mock-q-text') ? qEl.querySelector('.mock-q-text').textContent.trim() : '');
        if(ttsText){
          if(ttsBtn) ttsBtn.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(ttsText, ttsBtn); });
          speakQuestion.speak(ttsText, ttsBtn);
        }
      }
      const liveEl = $('#mockLive'); if(liveEl) liveEl.textContent = '';
      const manual = $('#mockManual');
      if(manual){
        /* 10/8 准备阶段只写笔记、不写答案 → 回答框整块隐藏（prep 才藏，其他阶段照常显示） */
        const manualWrap = manual.closest('.mock-manual');
        if(manualWrap) manualWrap.hidden = !!opts.isPrep;
        manual.value = '';
        /* 10/3 23:05：文本框按内容实时长高（她报「框不会随文字变化，要滑动才看全」） */
        manual.style.height = 'auto';
        manual.style.overflowY = 'hidden';
        bindManualAutoGrow();
      }
      /* 10/8 笔记机制重做：prep = 可编辑小纸条；之后 = 冻结只读、与回答无关（详见 bindNoteEditor 上方注释）。 */
      paintNoteForPhase(!!opts.isPrep);
      const hint = $('#mockHint'); if(hint) hint.textContent = '';
      const submitBtn = $('#mockSubmit');
      const timerWrap = $('#mockTimerWrap');
      const timerEl = $('#mockTimer');
      let resolved = false;

      // 计时（P2 准备 / 陈述）。恢复时从 opts.remaining 续计时，而非从头 timeLimit 开始。
      // 10/1 批3 修复：runExam 把剩余秒数放在 opts.resume.remaining，原代码只读 opts.remaining
      // → 断点续考时该题计时总是从头开始（秒数恢复从未生效过）。两处都兜住。
      if(opts.timeLimit && timerWrap && timerEl){
        timerWrap.hidden = false;
        const resumeLeft = (opts.resume && opts.resume.remaining != null) ? opts.resume.remaining : opts.remaining;
        let left = (resumeLeft != null) ? resumeLeft : opts.timeLimit;
        timerEl.textContent = fmtClock(left);
        timerWrap.classList.toggle('low', left <= 10);   // 10/1 批3：剩 10s 内小徽章转警示红
        window.__mockTick = setInterval(() => {
          left--;
          if(left <= 0){
            clearInterval(window.__mockTick); window.__mockTick = null;
            timerEl.textContent = '00:00';
            timerWrap.classList.add('low');
            if(hint) hint.textContent = opts.isPrep ? '准备时间到，可以开始陈述了。' : '时间到，请提交你刚才的回答。';
            if(opts.resume) saveResumeSnapshot(opts.resume.phase, opts.resume.index, 0);
          } else {
            timerEl.textContent = fmtClock(left);
            timerWrap.classList.toggle('low', left <= 10);
            if(opts.resume) saveResumeSnapshot(opts.resume.phase, opts.resume.index, left);
          }
        }, 1000);
      } else if(timerWrap){
        timerWrap.hidden = true;
        timerWrap.classList.remove('low');
      }

      // 提交（直接取文本框内容，无录音）
      if(submitBtn){
        submitBtn.textContent = opts.submitLabel || '提交 / 下一题';
        submitBtn.onclick = () => {
          if(resolved) return;
          resolved = true;
          if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
          const transcript = manual ? manual.value.trim() : '';
          /* 10/8：笔记在准备阶段由 #mockNoteInput 实时存 mockState.notebook，提交时无需再冻结
             （旧「把草稿冻结进 notebook」随镜像机制一起退役）。 */
          resolve({ transcript: transcript });
        };
      }
    });
  }

  /* ---------- 整场计时（真题总时长约 12~15 分钟，固定 15:00 倒计时，仅自控节奏不强制收卷） ---------- */
  const TOTAL_LIMIT = 15 * 60;
  function startTotalTimer(){
    stopTotalTimer();
    if(mockState.totalRemaining == null) mockState.totalRemaining = TOTAL_LIMIT;
    const wrap = $('#mockTotalTimerWrap');
    const el = $('#mockTotalTimer');
    if(wrap) wrap.hidden = false;
    const paint = () => {
      if(!el) return;
      const left = Math.max(0, mockState.totalRemaining);
      el.textContent = fmtClock(left);
      el.style.color = left <= 60 ? '#d9534f' : '';
    };
    paint();
    window.__mockTotalTick = setInterval(() => {
      mockState.totalRemaining = Math.max(0, (mockState.totalRemaining || 0) - 1);
      paint();
      if(mockState.totalRemaining <= 0){
        stopTotalTimer();
        if(typeof toast === 'function') toast('⏰ 整场时间到（15 分钟），请尽快完成当前回答并提交。');
        const hint = $('#mockHint');
        if(hint && !hint.textContent) hint.textContent = '⏰ 整场时间到，请提交当前回答。';
      }
    }, 1000);
  }
  function stopTotalTimer(){
    if(window.__mockTotalTick){ clearInterval(window.__mockTotalTick); window.__mockTotalTick = null; }
  }

  /* ---------- 题库抽样（真实 P1：若干大题 × 各若干小题 ≈ 十几个小题） ---------- */
  // 频率权重：超高频>高频>中频>低频（超高频即原必考题，权重最高）
  const FREQ_WEIGHT = { ultra:5, high:3, medium:2, low:1 };

  /* 统计每道题被模考过的次数（优先级选取依据）。
     从 DATA.mockRecords（口语整卷记录）里累加：
       P1 小题 → 以小题题目文本 q 为 key
       P2 话题 → 以 promptEn 为 key
     返回 Map<string, number>。P3 为 AI 实时生成，不纳入统计。 */
  function buildTakenCounts(){
    const m = new Map();
    const inc = k => { if(k == null) return; m.set(k, (m.get(k) || 0) + 1); };
    (DATA.mockRecords || []).forEach(rec => {
      if(!rec || !isSpeakingRecLite(rec)) return;
      (Array.isArray(rec.p1) ? rec.p1 : []).forEach(a => { if(!a.opening) inc(a.q); });   // 老脏数据 p1 可能非数组
      if(rec.p2 && rec.p2.promptEn) inc(rec.p2.promptEn);
    });
    return m;
  }
  // 轻量判定：是否口语整卷记录（避免误统计到旧五维整卷记录）
  function isSpeakingRecLite(r){
    return r && (r.kind === 'speaking' || (Array.isArray(r.parts) && r.p1));
  }

  /* 选题排序评分：从未考过(0次) → 考过次数少 → 同次数高频(frequency)优先。
     返回升序（越小越优先）。次数相同时 frequency 权重越大越优先（权重取负使其靠前）。 */
  function takenPriority(count, freq){
    const c = count || 0;
    const w = FREQ_WEIGHT[freq] || 1;
    return c * 100 - w; // 次数主导；同次数时 w 大（高频）则该项更小、更靠前
  }

  function randInt(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); }
  function weightedPick(arr){
    if(!arr.length) return null;
    let total = 0; for(const t of arr) total += (FREQ_WEIGHT[t.frequency] || 1);
    let r = Math.random() * total;
    for(const t of arr){ r -= (FREQ_WEIGHT[t.frequency] || 1); if(r <= 0) return t; }
    return arr[arr.length - 1];
  }
  /* 选 P1 大题集合。
     ⛔ 10/3 23:05 她拍板重写（她实测「至少回答了八九题必考题一个词卡里的题，这是不对的」）：
       真实机考结构 = ① 姓名热身 1 题 → ②【必考题（超高频）只从【一个】词卡里挑 3 题】
       → ③ 其余 8 题全部来自**非必考**词卡。
       ⚠️ 旧逻辑是「取前 4 大题 × 每题 3 小题 = 12」，而超高频权重 5 会让**多个超高频词卡
       挤进前 4 名**（每个再抽 3 小题）→ 必考题连着出七八题，正是她看到的问题。
     —— 故改为：ultra 词卡只取【一个】（考过次数少的优先，其次高频），其余名额只从非 ultra 里取。 */
  function buildP1Set(pool){
    const taken = buildTakenCounts();
    const picked = new Set();
    const qa = [];
    const PER_TOPIC = 3;   // 每个大题抽 3 个小题（她的口径：必考题=一个词卡里 3 题）
    const ULTRA_TOPIC = 1; // ⛔ 必考词卡只取 1 个（原来靠权重隐式达成，现显式化）
    // 总题量 = 开场姓名 1 + 必考 3 + 其余 8 = 12（她 23:05 拍板「1+3+8」）
    // ⚠️ 整除约束：必考 3 题 = ULTRA_TOPIC(1) × PER_TOPIC(3)，其余 8 题**除不尽 3**。
    //    最后一个大题用 tail=2 让总数正好 8（3+3+2），避免出现 13 题（超了她拍板的数量）。
    const TOPIC_N = 3;
    // 一个大题的"新鲜度" = 其小题里被考次数最少的那条（因为我们会优先抽它最新鲜的小题）
    const topicLeastTaken = (t) => {
      const qs = t.questions || [];
      if(!qs.length) return 0;
      let min = Infinity;
      qs.forEach(q => { const c = taken.get(q) || 0; if(c < min) min = c; });
      return min === Infinity ? 0 : min;
    };
    const takeTopic = (t, n) => {
      if(!t || picked.has(t.id)) return;
      picked.add(t.id);
      const qsAll = t.questions || [];
      const takeN = Math.min(n, qsAll.length);
      // 按"考过次数升序 + 同次数高频优先"给小题排序，取前 takeN 个（从未考过的优先），再按下标升序保持题库原始顺序
      const ranked = qsAll.map((q, i) => ({ i, q, score: takenPriority(taken.get(q), t.frequency) }))
        .sort((a, b) => (a.score - b.score) || (a.i - b.i))
        .slice(0, takeN)
        .sort((a, b) => a.i - b.i);
      for(const r of ranked) qa.push({ topic: t.titleEn || t.titleZh || '', q: r.q, core: t.frequency === 'ultra' });
    };
    const byFresh = (a, b) => (a.score - b.score) || (Math.random() - 0.5);
    // 第① 段：必考题（ultra）——**只取 1 个**词卡，抽 3 小题
    const ultraRanked = pool.filter(t => t.frequency === 'ultra')
      .map(t => ({ t, score: topicLeastTaken(t) })).sort(byFresh).slice(0, ULTRA_TOPIC);
    ultraRanked.forEach(x => takeTopic(x.t, PER_TOPIC));
    // 第② 段：其余名额**只在非 ultra 里选**（`filter` 排除了 ultra → 后面不可能再出必考题）
    // 3+3+2 = 8（最后一个大题只取 2 个，正好凑成她要的 8 题）
    const restRanked = pool.filter(t => t.frequency !== 'ultra' && !picked.has(t.id))
      .map(t => ({ t, score: takenPriority(topicLeastTaken(t), t.frequency) }))
      .sort(byFresh).slice(0, TOPIC_N);
    restRanked.forEach((x, i) => takeTopic(x.t, i === restRanked.length - 1 ? 2 : PER_TOPIC));
    return qa;
  }

  // 选 P2 话题：从未考过 > 考过次数少 > 同次数高频优先
  function pickP2Topic(pool){
    const taken = buildTakenCounts();
    const ranked = pool.map(t => ({ t, score: takenPriority(taken.get(t.promptEn), t.frequency) }))
      .sort((a, b) => (a.score - b.score) || (Math.random() - 0.5));
    return ranked.length ? ranked[0].t : null;
  }

  /* ---------- 主流程（支持断点续考） ----------
     runExam(snap)：snap 为 null 表示全新开考；否则为从 localStorage 恢复的快照，
     从该快照记录的 phase/index 处继续，已作答答案直接复用，不重头考。 */
  async function runExam(snap){
    const rp = snap ? snap.phase : 'P1';
    const doP1 = !snap || rp === 'P1';
    const doP2prep = !snap || rp === 'P1' || rp === 'P2-prep';
    const doP2talk = !snap || rp === 'P1' || rp === 'P2-prep' || rp === 'P2-talk';
    const doP3 = true; // 任何未完成快照都要走完 P3

    const topic = mockState.p2Topic;
    const promptHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + (topic.youShouldSay && topic.youShouldSay.length ? '<div class="mock-p2-say">你应该说到：<ul>' + topic.youShouldSay.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul></div>' : '')
      + '<p class="mock-prephint">你有 1 分钟准备，在下方「你的笔记」里写几个关键词提醒自己要讲什么（不录音、不算分）。时间到或点「结束准备」开始陈述。</p>';
    const talkHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + '<p class="mock-prephint">现在陈述 2 分钟（在下方输入框打字 / 粘贴你的英文回答）。时间到或点「完成 P2」提交。</p>';

    try{
      // ---- P1 ----
      setP2Mode(false);   // 10/1 批3：P1/P3 大窗居中（先关掉可能残留的 P2 两栏模式）
      if(doP1){
        const startIdx = (snap && rp === 'P1') ? snap.index : 0;
        let firstRemain = (snap && rp === 'P1' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < mockState.p1Set.length; i++){
          setMockSubCount(i+1, mockState.p1Set.length);
          const item = mockState.p1Set[i];
          const qHtml = (item.topic ? '<span class="mock-q-topic">' + escapeHtml(item.topic) + '</span> · ' : '') + escapeHtml(item.q);
          const res = await askQuestion({ phaseLabel:'Part 1（'+(i+1)+' / '+mockState.p1Set.length+'）', qHtml, ttsText:item.q, allowTts:true, allowRecord:true, submitLabel:(i===mockState.p1Set.length-1?'完成 P1，进入 P2':'下一题'), resume:{ phase:'P1', index:i, remaining:firstRemain } });
          firstRemain = undefined;
          mockState.answers.push({ part:'P1', q:item.q, transcript:res.transcript, opening: !!item.opening });
          saveResumeSnapshot('P1', i+1);
        }
      }
      // ---- P2 准备 ----
      if(doP2prep){
        setP2Mode(true);    // 10/1 批3：P2 切两栏（左题目 + 右考官小窗，贴真实机考布局）
        const prepRemain = (snap && rp === 'P2-prep' && snap.remaining != null) ? snap.remaining : undefined;
        await askQuestion({ phaseLabel:'Part 2 · 准备（1 min）', qHtml:promptHtml, allowRecord:false, isPrep:true, timeLimit:60, submitLabel:'结束准备，开始陈述', resume:{ phase:'P2-prep', index:0, remaining:prepRemain } });
        saveResumeSnapshot('P2-talk', 0);
      }
      // ---- P2 陈述 ----
      if(doP2talk){
        const talkRemain = (snap && rp === 'P2-talk' && snap.remaining != null) ? snap.remaining : undefined;
        const talk = await askQuestion({ phaseLabel:'Part 2 · 陈述（2 min）', qHtml:talkHtml, allowRecord:true, timeLimit:120, submitLabel:'完成 P2，进入 P3', resume:{ phase:'P2-talk', index:0, remaining:talkRemain } });
        mockState.answers.push({ part:'P2', q: topic.promptEn || '', transcript: talk.transcript });
        saveResumeSnapshot('P3', 0);
      }
      // ---- P3 ----
      /* 10/3 23:05 她报「P3 不是根据我的回答来出题的，好像自己根据 P2 题目出题」。
         🚨 根因：原实现是**一次性预生成 3 题**（common.js genSpeakingP3Three 里 prevA=''，
         续题时 AI 手上只有上一题、没有考生任何回答 → 只能对着 P2 题面泛化追问）。
         ✅ 修法：改为**逐题按需生成** —— 上一题你答完，把【你的答案】喂进去再问下一题。
            这是真实考官的行为（她 10/3 补充：「上次考官问我为什么想当心理医生、
            还问中国人普遍想干什么工作」，都是从我的回答里长出来的）。
            断点续考兜底：快照里已有 p3qs 就复用（不重复调 AI、不重复计费）。 */
      let p3qs = (snap && snap.p3qs && snap.p3qs.length) ? snap.p3qs : (mockState.p3qs || []);
      if(doP3){
        setP2Mode(false);   // 10/1 批3：P3 回到大窗居中（含「从 P3 快照直接恢复」的场景）
        const P3_N = 3;
        const startIdx = (snap && rp === 'P3') ? snap.index : 0;
        const p2ans = mockState.answers.find(x => x.part === 'P2');
        const p2Text = p2ans ? (p2ans.transcript || '') : '';
        // 预生成过的题（续考/兜底）照用；空数组则每题现场生成
        const pre = p3qs.length ? p3qs : [];
        const newlyGenerated = [];
        let firstRemain = (snap && rp === 'P3' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < P3_N; i++){
          setMockSubCount(i+1, P3_N);
          let q = pre[i];
          if(!q){
            setPhase('Part 3');
            const box = $('#mockQ');
            if(box) box.innerHTML = '正在生成 P3 追问…';
            try{
              // 逐题：把**上一题 + 你的答案**都带进去（原来只带上一题、答案是空的）
              const prevQ = i > 0 ? newlyGenerated[i-1] : null;
              const prevA = i > 0 ? ((mockState.answers.filter(x => x.part === 'P3').slice(-1)[0] || {}).transcript || '') : null;
              q = await window.MockGenP3.genNext(topic, p2Text, i, prevQ, prevA);
              newlyGenerated.push(q);
            }catch(e){
              toast('P3 AI 生成失败：' + e.message + '（已用预设题库）');
              q = (typeof window.MockGenP3.presetNext === 'function')
                ? window.MockGenP3.presetNext(topic, p2Text, i, pre[i-1], '')
                : 'Can you tell me more about that?';
              newlyGenerated.push(q);
            }
            mockState.p3qs = newlyGenerated.slice();
            saveResumeSnapshot('P3', i);   // 已生成的题存快照，刷新/续考不重复调 AI
          } else {
            newlyGenerated.push(q);
          }
          const qHtml = escapeHtml(q);
          const res = await askQuestion({ phaseLabel:'Part 3（'+(i+1)+' / '+P3_N+'）', qHtml, ttsText:q, allowTts:true, allowRecord:true, submitLabel:(i===P3_N-1?'完成 P3，出报告':'下一题'), resume: firstRemain != null ? { phase:'P3', index:i, remaining:firstRemain } : undefined });
          firstRemain = undefined;
          mockState.answers.push({ part:'P3', q: q, transcript: res.transcript });
          saveResumeSnapshot('P3', i+1);
        }
      }
      await finishExam();
    }catch(e){
      toast('模考中断：' + e.message);
      stopTotalTimer();
      clearResumeSnapshot();
      removeExitButton();
      mockState = null;               // 10/2 修：中断终态释放，允许重新开考（快照已清，再进走全新开考）
      setMockImmerse(false);        // 9/26：中断也要恢复常规布局
      setP2Mode(false);             // 10/1 批3：中断同样清两栏模式
      $('#mockStage').hidden = true; $('#mockReport').hidden = true;
      exitToBank();
    }
  }

  /* ---------- AI：生成 P3 追问（基于 P2 回答，3 个抽象问题，内部走逐题追问逻辑） ----------
     复用 common.js 的 window.MockGenP3（口语练习详情页 P3 也共用一份）。 */
  async function genP3Questions(p2, p2Transcript){
    return window.MockGenP3.gen3(p2, p2Transcript);
  }

  /* ---------- 预设 P3 追问（DeepSeek 生成失败时的兜底，保证 P3 绝不跳过） ---------- */
  function presetP3Questions(/* topic */){
    return window.MockGenP3.preset3();
  }

  /* ---------- 朗读发音检测（配讯飞 Key 时每 Part 后插入） ---------- */
  /* 参照句库：模考里让考生朗读的英文（通用雅思口语句，足够练发音）。按 Part 随机抽一句。 */

  /* ---------- AI：评分（分 P1/P2/P3 各按口语官方四维评；发音取设置固定分） ----------
     口语官方四维 = FC(流利与连贯) + LR(词汇) + GRA(语法) + 发音(固定分)；
     AI 只评 FC/LR/GRA，并对每题输出「真错误 → 改正 → 原因」明细（fixes）。
     红线（同 AI 诊断）：口语不是作文——默认标点/大小写全对，绝不纠；只列真语法/词汇错误；
     一行一条，不要「也可以 / 更自然」缓冲语。 */
  async function scorePart(part, answers){
    // 开场问（opening）不参与评分：真题里那是 ID 确认热身，不计分
    /* 10/4 00:40 P0 修（她 22:27 实测报「P1 全跳过却给 5.5」）：
       🚨 旧 bug = `A: (空)` 拼出来的 block **非空**（还有 Q: 题面），
          `if(!block.trim()) return null` 拦不住 → 照样送 AI → AI 面对一屏"(空)"
          按默认中位给 5.5 → 总分 (5.5+P2+P3)/3 被拉平。
       ✅ 修法（她 00:38 拍板）：
          ① 先按【实际作答】筛出有效题（全空的那个 Part 判为「未作答」）
          ② **整Part 全空 → FC 直接给 4（雅思有效最低档）+ 单列不参与平均**（她的选择）
          ③ **部分未答 → 只把答了的题送 AI，再按作答比例下调 FC**（她的选择）
          ④ prompt 明写「未作答的题不给它编错误」，杜绝 fixes 里出现编造的逐题点评 */
    const allQ = answers.filter(a => a.part === part && !a.opening);
    const answered = allQ.filter(a => (a.transcript || '').trim());
    const skipped = allQ.length - answered.length;
    if(!allQ.length) return null;                       // 该 Part 压根没题（异常数据）
    // ② 整个 Part 一题没答：FC = 4（雅思有效最低档），LR/GRA 同样给 4，标 unanswered 单列
    if(!answered.length){
      return { fc: 4, lr: 4, gra: 4, fixes: [], unanswered: true,
               answeredCount: 0, questionCount: allQ.length,
               summary: 'Part ' + part + ' 全部 ' + allQ.length + ' 题未作答，按有效最低档计分' };
    }
    // ①③ 只把真作答的题送 AI（未答的不进 block）
    const block = answered.map(a => 'Q: ' + a.q + '\nA: ' + a.transcript.trim()).join('\n\n');
    if(!block.trim()) return null;
    const sys = 'You are an IELTS speaking examiner. Below are the candidate\'s TYPED answers to IELTS Speaking ' + part + ' questions.\n'
      + 'Score this part ONLY on 3 of the official dimensions (pronunciation is handled separately by the user):\n'
      + '- FC (Fluency & Coherence, 流利度与连贯)\n'
      + '- LR (Lexical Resource, 词汇资源)\n'
      + '- GRA (Grammatical Range & Accuracy, 语法多样性与准确性)\n'
      + 'VALID SCORES (only these values are allowed, 0.5 steps): 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8.\n'
      + 'HALF-BAND RULE (official IELTS): a half band x.5 means the performance FULLY matches band x AND PARTIALLY matches band x+1. When the performance sits between two bands, you MUST give the half band — never round to a whole number.\n'
      + 'Band descriptors (condensed from the official public version):\n'
      + 'FC: 5=usually maintains flow but relies on repetition/self-correction/slow speech; simple speech fluent, complex communication causes fluency problems | 6=willing to speak at length though may lose coherence at times; uses connectives and discourse markers but not always appropriately | 7=speaks at length with some hesitation; develops topics coherently; uses a range of connectives with some flexibility\n'
      + 'LR: 5=manages familiar and unfamiliar topics but vocabulary flexibility is limited; paraphrase attempts with mixed success | 6=sufficient vocabulary for lengthy discussions; meaning is clear though word choice is sometimes inappropriate | 7=vocabulary used flexibly across topics; some less common items; occasional inappropriacies\n'
      + 'GRA: 5=basic sentence forms with reasonable accuracy; limited range of complex structures, which usually contain errors | 6=mix of short and complex sentences; errors occur in complex structures but meaning is clear | 7=range of structures; frequent error-free sentences; some errors remain\n'
      + 'CALIBRATION anchors: typed answers with clear meaning and a mix of simple/complex sentences but noticeable errors in complex structures → GRA 6; mostly simple sentences with frequent word-order/tense errors that never block understanding → GRA 5.5; varied structures with frequent error-free sentences but recurring tense slips → GRA 6.5.\n'
      + 'Then for EACH question, list the candidate\'s genuine grammar or vocabulary errors.\n'
      + 'RULES: this is speaking, not writing — punctuation and capitalization are always correct by default, NEVER mention them; only real errors, no "you could also say / more natural" filler; one error per entry, terse; if a question has no real error, "errors" must be an empty array. Include ALL questions in "fixes".\n'
      /* 10/4 00:40（她 00:38 拍板）：未作答的题【不送进 block】了，这里再加一条双保险 ——
         她截图里报告曾出现「About more than 10 years → More than 10 years」这种**根本没作答的题的编造点评**。 */
      + 'CRITICAL: only the questions shown below were actually answered. The candidate SKIPPED the others entirely. NEVER invent feedback, corrections, praise, or imagined answers for any question that is not present in the input — if a question is not listed here, it was not answered and you must say nothing about it.\n'
      + 'Output ONLY JSON: {"fc":x,"lr":x,"gra":x,"summary":"一句话中文简评","fixes":[{"q":"question text","errors":[{"wrong":"...","correct":"...","note":"...short reason..."}]}]}. Do not output anything else.';
    const user = 'Part ' + part + ' (questions and the candidate\'s typed answers):\n\n' + block;
    const content = await callRelay('mock_score', [
      { role:'system', content:sys },
      { role:'user', content:user }
    ], 0.4);
    const j = aiJson(content);
    const num = k => { const n = Number(j[k]); return isNaN(n) ? null : n; };
    const p = { fc: num('fc'), lr: num('lr'), gra: num('gra') };
    if([p.fc, p.lr, p.gra].some(v => v == null)) throw new Error('AI 评分返回格式异常（Part ' + part + '）');
    p.fixes = Array.isArray(j.fixes) ? j.fixes.filter(f => f && f.q) : [];
    p.summary = j.summary || '';
    /* ③ 部分未答 → 按作答比例下调 FC（她 00:38 拍板「按比例扣 FC」）
       真实考试里跳过题 = 没有展示流利度 = FC 要掉；不扣分等于白送。
       只调 FC（LR/GRA 靠实际用出来的词句，答了的题不受影响）。 */
    p.answeredCount = answered.length;
    p.questionCount = allQ.length;
    p.unanswered = false;
    if(skipped > 0){
      const ratio = answered.length / allQ.length;
      const before = p.fc;
      p.fc = Math.max(4, Math.round(before * ratio * 2) / 2);
      p.fcPenalty = Math.round((before - p.fc) * 2) / 2;
      p.summary = (p.summary ? p.summary + ' ' : '')
        + '（' + allQ.length + ' 题里有 ' + skipped + ' 题未作答，流利度按作答比例 ' + Math.round(ratio * 100) + '% 下调 '
        + before + ' → ' + p.fc + '）';
    }
    return p;
  }

  async function scoreExam(answers){
    const parts = { p1: null, p2: null, p3: null };
    let summary = '';
    const order = [['p1','P1'],['p2','P2'],['p3','P3']];
    for(const [key, label] of order){
      try{
        parts[key] = await scorePart(label, answers);
        if(parts[key] && parts[key].summary) summary += (summary ? '\n' : '') + label + '：' + parts[key].summary;
      }catch(e){
        if(typeof toast === 'function') toast('Part ' + label + ' 评分失败：' + e.message);
      }
    }
    if(!Object.values(parts).some(Boolean)) throw new Error('AI 评分全部失败');
    // overall 由 finishExam 统一合成（发音取固定分）
    return { parts: parts, summary: summary };
  }

  /* ---------- 收尾：报告 + 落库 ---------- */
  async function finishExam(){
    setPhase('评分中…');
    const source = mockState.pronSource; // 'fixed' | 'none'
    // 发音分：只取设置里的固定分（发音评测已移除，不再用讯飞/AI 估算）
    let pronunciation = null;
    if(source === 'fixed') pronunciation = Number(DATA.settings.pronunciationScore);
    let report = null;
    try{
      report = await scoreExam(mockState.answers);
    }catch(e){
      toast('AI 评分失败：' + e.message + '（回答已保存，可稍后在「回顾」查看）');
    }
    // 兜底：发音仍为空 → 若有设置固定分则用
    if(pronunciation == null && DATA.settings.pronunciationScore != null) pronunciation = Number(DATA.settings.pronunciationScore);

    if(report){
      // 各部分四维 overall = (FC + LR + GRA + 发音)/4；未填发音固定分则只均 FC/LR/GRA
      ['p1','p2','p3'].forEach(k => {
        const p = report.parts[k];
        if(!p) return;
        const vals = [p.fc, p.lr, p.gra].filter(v => v != null);
        if(pronunciation != null && vals.length === 3){
          p.overall = Math.round(((pronunciation + vals[0] + vals[1] + vals[2]) / 4) * 2) / 2;
        } else if(vals.length){
          p.overall = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2;
        }
      });
      /* 10/4 00:40（她 00:38 拍板「给最低分4 并单列」）：
         整 Part 未作答的**不参与总分平均** —— 否则一个 4 分的 0 作答 part
         会把总分硬拉低，而它本来就不该代表她的真实水平。
         但要在报告里单列出来 + 明写作答率，让「5.5 分」这种数字不再骗人。 */
      const allP = ['p1','p2','p3'].map(k => report.parts[k]).filter(Boolean);
      const scored = allP.filter(p => !p.unanswered);
      const notAnswered = allP.filter(p => p.unanswered);
      const qTotal = allP.reduce((s, p) => s + (p.questionCount || 0), 0);
      const qAnswered = allP.reduce((s, p) => s + (p.answeredCount || 0), 0);
      report.answeredParts = scored.length;
      report.unansweredParts = notAnswered.map(p => p.part || null);
      report.questionCount = qTotal;
      report.answeredCount = qAnswered;
      report.answerRate = qTotal ? Math.round(qAnswered / qTotal * 100) : 0;
      report.overall = scored.length
        ? Math.round((scored.map(p => p.overall).reduce((a, b) => a + b, 0) / scored.length) * 2) / 2
        : null;
      // 作答率过低 → 报告可信度提示（她截图那种"P1全跳过还5.5"的观感就是缺这个）
      report.lowConfidence = qTotal > 0 && qAnswered / qTotal < 0.6;
      report.pronMode = source;
      report.pronDetail = null;
      report.pronunciationScore = pronunciation; // 供报告渲染四维中的「发音」
      // 附带完整转写，供报告渲染「问题 / 我的回答 / 哪里错 / 改成什么」
      report.p1 = mockState.answers.filter(a => a.part === 'P1').map(a => ({ q:a.q, transcript:a.transcript, opening: !!a.opening }));
      const p2a = mockState.answers.find(x => x.part === 'P2');
      report.p2 = p2a ? { promptEn: mockState.p2Topic.promptEn, transcript:p2a.transcript } : null;
      report.p3 = mockState.answers.filter(a => a.part === 'P3').map(a => ({ q:a.q, transcript:a.transcript }));
    }

    const rec = {
      id: uid(),
      ts: Date.now(),
      kind: 'speaking',
      date: todayKey(),
      overall: report ? report.overall : null,
      pronunciationScore: pronunciation,
      pronMode: source,
      pronDetail: null,
      parts: report ? report.parts : null,
      p1: mockState.answers.filter(a => a.part === 'P1').map(a => ({ q:a.q, transcript:a.transcript, opening: !!a.opening })),
      p2: (() => { const a = mockState.answers.find(x => x.part === 'P2'); return a ? { promptEn: mockState.p2Topic.promptEn, transcript:a.transcript } : null; })(),
      p3: mockState.answers.filter(a => a.part === 'P3').map(a => ({ q:a.q, transcript:a.transcript })),
      summary: report ? report.summary : ''
    };
    DATA.mockRecords.push(rec);
    hubSave(); scheduleCloudUpload();

    $('#mockStage').hidden = true;
    $('#mockReport').hidden = false;
    setMockImmerse(false);          // 9/26：出报告 → 恢复常规布局（报告页要能点 tab / 侧栏）
    setP2Mode(false);               // 10/1 批3：出报告清两栏模式
    stopTotalTimer();
    const body = $('#mockReportBody');
    if(body) body.innerHTML = report
      ? (window.MockReport && typeof window.MockReport.render === 'function'
          ? window.MockReport.render(report)
          : '<p class="muted">报告组件未加载完成，但本场回答与评分已存入「回顾」，重新进入口语页可查看。</p>')
      : '<p class="muted">本次评分未完成（AI 接口异常），但你的回答已存入「回顾」。</p>';
    // 模考完成：清理进度快照与「退出」按钮，下一次进入不再自动续考
    clearResumeSnapshot();
    removeExitButton();
    mockState = null;   // 10/2 修：终态释放（报告数据上方已全部取出渲染），允许点「模考」/「再来一次」重新开考
  }

  /* ---------- 全新开考入口（由「开始模考」按钮触发） ---------- */
  async function startExam(){
    if(mockEntering || mockState) return;   // 10/2 修：注入窗口/考试进行中防并发双开（报告页「再来一次」连点同此守卫）
    mockEntering = true;
    await ensureMockLib();   // 确保报告库（MockReport）就绪后再开考，避免 finishExam 渲染报告时缺库
    // 仅从纯官方题库抽题：剔除框架母本(带 framework 字段 / id 形如 sp_p[12]_*)及任何残留非题目项，杜绝抽到老题库/框架内容
    const p1 = DATA.speaking.filter(x => x.type === 'P1' && x.questions && x.questions.length && !x.framework && !/^sp_p[12]_\d+$/.test(x.id || ''));
    const p2 = DATA.speaking.filter(x => x.type === 'P2' && x.promptEn && !x.framework && !/^sp_p[12]_\d+$/.test(x.id || ''));
    if(!p1.length || !p2.length){ toast('口语题库为空，无法模考'); mockEntering = false; return; }

    // 发音来源：填了固定分 → 'fixed'（发音取固定分）；否则 'none'（发音不计入总分，不再做发音评测）
    const fixed = DATA.settings.pronunciationScore;
    const pronSource = (fixed != null) ? 'fixed' : 'none';
    // 全新开考前先清掉任何旧快照，避免与上一次未完成的模考串档
    clearResumeSnapshot();
    mockState = { p1Set: buildP1Set(p1), p2Topic: pickP2Topic(p2), answers: [], pronSource, p3qs: [], totalRemaining: TOTAL_LIMIT, examiner: pickExaminer(), notebook: '' };
    mockEntering = false;   // 10/2 修：状态已同步就位，此后重入由 mockState 挡（本句到 await runExam 之间全同步）
    // 真题固定开场问：每场模考第一个问题固定为姓名确认（ID 热身，不参与评分，但会出现在完整记录里）
    mockState.p1Set.unshift({ topic: 'Opening', q: 'Can you tell me your full name?', opening: true });
    renderExaminer(mockState.examiner);   // 10/1 批3：每场随机考官上屏
    startTotalTimer();

    $('#mockReport').hidden = true;
    $('#mockStage').hidden = false;
    showOnlyMockView();             // 10/8：进模考 = 只剩模考（含「再来一次」等非 tab 入口）
    setMockImmerse(true);           // 9/26：开始模考 → 整页只剩模考内容
    injectExitButton();

    await runExam(null);
  }

  /* ---------- 初始化 ---------- */
  ready(async () => {
    // 事件委托先绑定（同步、不依赖任何 await）：报告页「再来一次」任何时刻可点。
    bindMockViewDelegation();
    /* 10/2（她拍板）：点「模考」直达全屏考试——speaking.js MOCK 分支调用本入口。
       有未完成快照=自动续考；否则全新开考。 */
    window.__mockEnter = async function(){
      /* 10/2 修：统一入口守卫——ensureMockLib 注入窗口内连点、考试中再点，一律忽略，
         杜绝两个 runExam 并发（ready 里的自动续考也改走本函数，见下）。 */
      if(mockEntering || mockState) return;
      const snap = loadResumeSnapshot();
      if(snap){ await resumeFromSnapshot(); }
      else { await startExam(); }
    };
    await ensureMockLib();
    // 断点续考：若上次模考未做完就离开了，回到口语页时自动恢复现场（原有行为保留）
    // 10/2 修：统一走 __mockEnter（带竞态锁），避免「自动续考」与「用户手动点模考 tab」并发双开
    if(loadResumeSnapshot()){ await window.__mockEnter(); }
  });
})();
