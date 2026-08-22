/* 口语模考 · 主控制器（状态机）
   流程：开始卡 → P1(2 必选大题 + 2 非必选大题·每题 3 小题·含开场姓名共 13 个) → P2(准备 1min + 陈述 2min) → P3(3 题 AI 追问，复用 common.js MockGenP3) → 报告
   架构：
   - 输入层：考生直接在页面文本框手写 / 粘贴英文回答（录音 / 语音转写已移除）
   - 大脑层：callRelay → DeepSeek（生成 P3 追问 + 读文字评分）
   - 发音分：只取设置里的固定分（发音评测已移除，不再做讯飞 / AI 估算）
   红线：不碰 callRelay / DATA.scores；发音分走设置；PAGES 只追加 mock；题库只读。 */
(function(){
  let mockState = null;

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
  /* ---------- 右下角红色「退出」按钮 + 退出确认对话框 ----------
     退出交互：点 FAB → 弹对话框，三选一：
       · 保存进度并退出：保留 localStorage 快照，返回开始卡（下次进入模考自动续考；同会话也可点「继续上次模考」）
       · 清除记录并退出：清掉快照，返回开始卡
       · 继续模考：关闭对话框，留在当前题
     FAB 挂在 #mockStage 内（fixed 定位），舞台隐藏 / 切 tab / 显示报告时随父级自动消失，不污染其他页面。 */
  function injectExitButton(){
    if($('#mockExitFab')) return;
    const stage = $('#mockStage');
    if(!stage) return;
    const b = document.createElement('button');
    b.id = 'mockExitFab';
    b.type = 'button';
    b.className = 'mock-exit-fab';
    b.setAttribute('aria-label', '退出模考');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg> 退出模考';
    b.onclick = () => showExitModal();
    stage.appendChild(b);
  }
  function removeExitButton(){ const b = $('#mockExitFab'); if(b) b.remove(); }
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
  function exitToStart(save){
    if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
    stopTotalTimer();
    if(!save) clearResumeSnapshot();   // 保存则不清除，保留快照供续考
    removeExitButton();
    mockState = null;
    $('#mockStage').hidden = true;
    $('#mockReport').hidden = true;
    $('#mockStart').hidden = false;
    renderMockStart();
    toast(save ? '已保存进度，下次进入模考可继续' : '已清除本次模考记录');
  }
  async function resumeFromSnapshot(){
    const snap = loadResumeSnapshot();
    if(!snap){ renderMockStart(); return; }
    mockState = { p1Set: snap.p1Set, p2Topic: snap.p2Topic, answers: snap.answers, pronSource: snap.pronSource, p3qs: snap.p3qs || [], totalRemaining: (snap.totalRemaining != null ? snap.totalRemaining : TOTAL_LIMIT) };
    $('#mockStart').hidden = true; $('#mockReport').hidden = true; $('#mockStage').hidden = false;
    injectExitButton();
    startTotalTimer();
    toast('已恢复上次未完成的模考，继续答题');
    await runExam(snap);
  }

  /* ---------- 工具 ---------- */
  function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function sampleOne(a){ return a[Math.floor(Math.random()*a.length)]; }
  function fmtClock(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  function setPhase(t){ const el=$('#mockPhase'); if(el) el.textContent=t; }
  function setMockStep(part){
    const steps = document.querySelectorAll('#mockSteps .mock-step');
    steps.forEach(s => {
      const p = s.getAttribute('data-step');
      s.classList.remove('active', 'done');
      if(p === String(part)) s.classList.add('active');
      else if(Number(p) < Number(part)) s.classList.add('done');
    });
  }
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
        const s = document.createElement('script');
        s.src = src; s.defer = true; s.setAttribute('data-mocklib', src);
        s.onload = () => { pending--; if(pending<=0) done(); };
        s.onerror = () => { pending--; if(pending<=0) done(); };
        document.head.appendChild(s);
      });
      if(pending === 0) done();
      setTimeout(done, 2500); // 兜底：2.5s 后无论如何继续
    });
  }

  /* ---------- 开始卡 ---------- */
  function renderMockStart(){
    const box = $('#mockPreCheck');
    if(!box) return;
  const fixed = DATA.settings.pronunciationScore;
  const hasKey = !!DATA.settings.relayToken;
  const row = (ok, label, val) =>
    '<div class="mock-precheck-row '+(ok?'ok':'warn')+'">'+label+'：'+(ok?val:'<span class="mock-need">'+val+'</span>')+'</div>';
  let pronVal;
  if(fixed != null) pronVal = '用设置里填的固定分 <b>' + fixed + '</b>（发音不评测，直接取固定分）';
  else pronVal = '未填固定分 → 发音不计入总分（去「设置」填一个固定分即可）';
  box.innerHTML =
    row(fixed != null, '🔊 发音分', pronVal) +
    row(hasKey, '🤖 AI 接口', hasKey ? '已配置 DeepSeek Key' : '未配置（<a href="settings.html">去设置填</a>）');

  // 续考入口：若上次有未完成的模考（保存进度退出后，同会话内可直接「继续上次模考」），
  // 显示提示 + 续考按钮，并隐藏原本的「开始模考 →」（避免误点覆盖）。无快照时恢复显示。
  let resumeBox = $('#mockResumeBox'); if(resumeBox) resumeBox.remove();
  const startBtn = $('#mockStartBtn');
  const snap = loadResumeSnapshot();
  if(snap){
    if(startBtn) startBtn.hidden = true;
    const sec = $('#mockStart');
    if(sec){
      resumeBox = document.createElement('div');
      resumeBox.id = 'mockResumeBox';
      resumeBox.className = 'mock-resume-box';
      const when = snap.ts ? new Date(snap.ts).toLocaleString() : '';
      resumeBox.innerHTML = '<div class="mock-resume-title">你有一场未完成的模考' + (when ? '（' + when + '）' : '') + '</div>'
        + '<div class="mock-resume-actions">'
        + '<button class="btn btn-primary" id="mockResumeBtn">继续上次模考 →</button>'
        + '<button class="btn" id="mockNewBtn">开始新模考（覆盖）</button>'
        + '</div>';
      sec.appendChild(resumeBox);
      const rb = $('#mockResumeBtn'); if(rb) rb.onclick = () => resumeFromSnapshot();
      const nb = $('#mockNewBtn'); if(nb) nb.onclick = () => { if(confirm('确定放弃上次未完成的模考，开始新的一场吗？')) startExam(); };
    }
  } else {
    if(startBtn) startBtn.hidden = false;
  }
  }

  /* ---------- 单题交互（手动输入文本框，无录音）---------- */
  function askQuestion(opts){
    return new Promise(resolve => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      setPhase(opts.phaseLabel || '');
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
      const manual = $('#mockManual'); if(manual) manual.value = '';
      const hint = $('#mockHint'); if(hint) hint.textContent = '';
      const submitBtn = $('#mockSubmit');
      const timerWrap = $('#mockTimerWrap');
      const timerEl = $('#mockTimer');
      let resolved = false;

      // 计时（P2 准备 / 陈述）。恢复时从 opts.remaining 续计时，而非从头 timeLimit 开始。
      if(opts.timeLimit && timerWrap && timerEl){
        timerWrap.hidden = false;
        let left = (opts.remaining != null) ? opts.remaining : opts.timeLimit;
        timerEl.textContent = fmtClock(left);
        window.__mockTick = setInterval(() => {
          left--;
          if(left <= 0){
            clearInterval(window.__mockTick); window.__mockTick = null;
            timerEl.textContent = '00:00';
            if(hint) hint.textContent = opts.isPrep ? '准备时间到，可以开始陈述了。' : '时间到，请提交你刚才的回答。';
            if(opts.resume) saveResumeSnapshot(opts.resume.phase, opts.resume.index, 0);
          } else {
            timerEl.textContent = fmtClock(left);
            if(opts.resume) saveResumeSnapshot(opts.resume.phase, opts.resume.index, left);
          }
        }, 1000);
      } else if(timerWrap){
        timerWrap.hidden = true;
      }

      // 提交（直接取文本框内容，无录音）
      if(submitBtn){
        submitBtn.textContent = opts.submitLabel || '提交 / 下一题';
        submitBtn.onclick = () => {
          if(resolved) return;
          resolved = true;
          if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
          const transcript = manual ? manual.value.trim() : '';
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
      (rec.p1 || []).forEach(a => { if(!a.opening) inc(a.q); });
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
  /* 选 P1 大题集合：全局按"考过次数升序（最优先）+ 同次数高频优先"排序，取前 TOPIC_N 个大题。
     题内小题再按同样的优先级取前 PER_TOPIC 个（从未考过的优先）。
     超高频（原必考题）频率权重最高（见 FREQ_WEIGHT.ultra），故未考过的超高频题自然排前；一旦考过多次，
     让位给仍新鲜的高频题，实现「轮换」——避免每场模考都抽到同样的大题（旧逻辑按题库顺序硬取，会重复）。 */
  function buildP1Set(pool){
    const taken = buildTakenCounts();
    const picked = new Set();
    const qa = [];
    const PER_TOPIC = 3; // 每个大题抽 3 个小题
    const TOPIC_N = 4;   // 固定 4 大题 × 3 小题 = 12，加开场姓名共 13
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
      for(const r of ranked) qa.push({ topic: t.titleEn || t.titleZh || '', q: r.q });
    };
    // 所有大题按全局优先级排序，取前 TOPIC_N 个（同分时频率越高越靠前，再随机破平）
    pool.map(t => ({ t, score: takenPriority(topicLeastTaken(t), t.frequency) }))
      .sort((a, b) => (a.score - b.score) || (Math.random() - 0.5))
      .slice(0, TOPIC_N)
      .forEach(x => takeTopic(x.t, PER_TOPIC));
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
      + '<p class="mock-prephint">你有 1 分钟准备，下方输入框可打草稿（不录音）。时间到或点「结束准备」开始陈述。</p>';
    const talkHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + '<p class="mock-prephint">现在陈述 2 分钟（在下方输入框打字 / 粘贴你的英文回答）。时间到或点「完成 P2」提交。</p>';

    try{
      // ---- P1 ----
      if(doP1){
        const startIdx = (snap && rp === 'P1') ? snap.index : 0;
        let firstRemain = (snap && rp === 'P1' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < mockState.p1Set.length; i++){
          setMockStep('1');
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
      if(doP2prep || doP2talk) setMockStep('2');
      if(doP2prep){
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
      let p3qs = (snap && snap.p3qs && snap.p3qs.length) ? snap.p3qs : (mockState.p3qs || []);
      if(doP3){
        if(!p3qs.length){
          setPhase('Part 3');
          $('#mockQ').innerHTML = '正在生成 P3 追问…';
          try{
            const p2ans = mockState.answers.find(x => x.part === 'P2');
            p3qs = await genP3Questions(topic, p2ans ? p2ans.transcript : '');
            mockState.p3qs = p3qs;
          }catch(e){
            // 绝不直接跳到出成绩：用预设题库兜底，停留在 P3 界面让考生继续作答
            toast('P3 AI 生成失败：' + e.message + '（已用预设题库）');
            p3qs = presetP3Questions(topic);
            mockState.p3qs = p3qs;
          }
        }
        const startIdx = (snap && rp === 'P3') ? snap.index : 0;
        let firstRemain = (snap && rp === 'P3' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < p3qs.length; i++){
          setMockStep('3');
          const qHtml = escapeHtml(p3qs[i]);
          const res = await askQuestion({ phaseLabel:'Part 3（'+(i+1)+' / '+p3qs.length+'）', qHtml, ttsText:p3qs[i], allowTts:true, allowRecord:true, submitLabel:(i===p3qs.length-1?'完成 P3，出报告':'下一题'), resume: firstRemain != null ? { phase:'P3', index:i, remaining:firstRemain } : undefined });
          firstRemain = undefined;
          mockState.answers.push({ part:'P3', q: p3qs[i], transcript: res.transcript });
          saveResumeSnapshot('P3', i+1);
        }
      }
      await finishExam();
    }catch(e){
      toast('模考中断：' + e.message);
      stopTotalTimer();
      clearResumeSnapshot();
      removeExitButton();
      $('#mockStage').hidden = true; $('#mockStart').hidden = false; renderMockStart();
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
    const block = answers.filter(a => a.part === part && !a.opening)
      .map(a => 'Q: ' + a.q + '\nA: ' + (a.transcript || '(空)')).join('\n\n');
    if(!block.trim()) return null;
    const sys = 'You are an IELTS speaking examiner. Below are the candidate\'s typed answers to IELTS Speaking ' + part + ' questions.\n'
      + 'Score this part ONLY on 3 of the official dimensions (pronunciation is handled separately by the user), each 0-9 in 0.5 steps:\n'
      + '- FC (Fluency & Coherence, 流利度与连贯)\n'
      + '- LR (Lexical Resource, 词汇资源)\n'
      + '- GRA (Grammatical Range & Accuracy, 语法多样性与准确性)\n'
      + 'Then for EACH question, list the candidate\'s genuine grammar or vocabulary errors.\n'
      + 'RULES: this is speaking, not writing — punctuation and capitalization are always correct by default, NEVER mention them; only real errors, no "you could also say / more natural" filler; one error per entry, terse; if a question has no real error, "errors" must be an empty array. Include ALL questions in "fixes".\n'
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
      const partOv = [];
      ['p1','p2','p3'].forEach(k => {
        const p = report.parts[k];
        if(!p) return;
        const vals = [p.fc, p.lr, p.gra].filter(v => v != null);
        if(pronunciation != null && vals.length === 3){
          p.overall = Math.round(((pronunciation + vals[0] + vals[1] + vals[2]) / 4) * 2) / 2;
        } else if(vals.length){
          p.overall = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2;
        }
        if(p.overall != null) partOv.push(p.overall);
      });
      report.overall = partOv.length ? Math.round((partOv.reduce((a, b) => a + b, 0) / partOv.length) * 2) / 2 : null;
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
    stopTotalTimer();
    const body = $('#mockReportBody');
    if(body) body.innerHTML = report
      ? window.MockReport.render(report)
      : '<p class="muted">本次评分未完成（AI 接口异常），但你的回答已存入「回顾」。</p>';
    // 模考完成：清理进度快照与「退出」按钮，下一次进入不再自动续考
    clearResumeSnapshot();
    removeExitButton();
  }

  /* ---------- 全新开考入口（由「开始模考」按钮触发） ---------- */
  async function startExam(){
    if(!DATA.settings.relayToken){
      toast('请先在「设置 / AI 接口」填写 DeepSeek Key'); return;
    }
    const p1 = DATA.speaking.filter(x => x.type === 'P1' && x.questions && x.questions.length);
    const p2 = DATA.speaking.filter(x => x.type === 'P2' && x.promptEn);
    if(!p1.length || !p2.length){ toast('口语题库为空，无法模考'); return; }

    // 发音来源：填了固定分 → 'fixed'（发音取固定分）；否则 'none'（发音不计入总分，不再做发音评测）
    const fixed = DATA.settings.pronunciationScore;
    const pronSource = (fixed != null) ? 'fixed' : 'none';
    // 全新开考前先清掉任何旧快照，避免与上一次未完成的模考串档
    clearResumeSnapshot();
    mockState = { p1Set: buildP1Set(p1), p2Topic: pickP2Topic(p2), answers: [], pronSource, p3qs: [], totalRemaining: TOTAL_LIMIT };
    // 真题固定开场问：每场模考第一个问题固定为姓名确认（ID 热身，不参与评分，但会出现在完整记录里）
    mockState.p1Set.unshift({ topic: 'Opening', q: 'Can you tell me your full name?', opening: true });
    startTotalTimer();

    $('#mockStart').hidden = true;
    $('#mockReport').hidden = true;
    $('#mockStage').hidden = false;
    injectExitButton();

    await runExam(null);
  }

  /* ---------- 初始化 ---------- */
  ready(async () => {
    await ensureMockLib();
    // 断点续考：若上次模考未做完就离开了，返回模考页时自动恢复现场
    const snap = loadResumeSnapshot();
    if(snap){ await resumeFromSnapshot(); }
    else { renderMockStart(); }
    const startBtn = $('#mockStartBtn');
    if(startBtn) startBtn.onclick = () => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      startExam();
    };
    const retry = $('#mockRetryBtn');
    if(retry) retry.onclick = () => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      $('#mockReport').hidden = true; $('#mockStage').hidden = true; $('#mockStart').hidden = false;
      renderMockStart();
    };
  });
})();
