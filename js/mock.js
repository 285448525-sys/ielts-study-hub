/* 口语模考 · 主控制器（状态机）
   流程：开始卡 → P1(多个大题·每题若干小题·共约十几个) → P2(准备 1min + 陈述 2min) → P3(4-5 题 AI 追问) → 报告
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
  function injectAbandonButton(){
    if($('#mockAbandonBtn')) return;
    const b = document.createElement('button');
    b.id = 'mockAbandonBtn';
    b.type = 'button';
    b.className = 'btn';
    b.textContent = '放弃本次模考';
    b.style.cssText = 'float:right;margin-left:8px;padding:4px 10px;font-size:12px;background:transparent;color:var(--muted,#888);border:1px solid #ddd';
    b.onclick = () => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      clearResumeSnapshot();
      const ab = $('#mockAbandonBtn'); if(ab) ab.remove();
      const st = $('#mockStage'); if(st) st.hidden = true;
      const rp = $('#mockReport'); if(rp) rp.hidden = true;
      const ms = $('#mockStart'); if(ms) ms.hidden = false;
      mockState = null;
      renderMockStart();
      toast('已放弃未完成的模考');
    };
    const phase = $('#mockPhase');
    const stage = $('#mockStage');
    if(phase && phase.parentNode) phase.parentNode.insertBefore(b, phase);
    else if(stage) stage.insertBefore(b, stage.firstChild);
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
  }

  /* ---------- 单题交互（手动输入文本框，无录音）---------- */
  function askQuestion(opts){
    return new Promise(resolve => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      setPhase(opts.phaseLabel || '');
      const qEl = $('#mockQ'); if(qEl) qEl.innerHTML = opts.qHtml || '';
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

  /* ---------- 题库抽样（真实 P1：若干大题 × 各若干小题 ≈ 十几个小题） ---------- */
  // 频率权重：超高频>高频>中高频>普通；必考题另行强制抽取
  const FREQ_WEIGHT = { ultra:4, high:3, medium:2, normal:1 };
  function randInt(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); }
  function weightedPick(arr){
    if(!arr.length) return null;
    let total = 0; for(const t of arr) total += (FREQ_WEIGHT[t.frequency] || 1);
    let r = Math.random() * total;
    for(const t of arr){ r -= (FREQ_WEIGHT[t.frequency] || 1); if(r <= 0) return t; }
    return arr[arr.length - 1];
  }
  function buildP1Set(pool){
    const must = pool.filter(t => t.frequency === 'must');
    const rest = pool.filter(t => t.frequency !== 'must');   // 非必考：按频率加权抽奖
    const picked = new Set();
    const qa = [];
    const takeTopic = (t, n) => {
      if(!t || picked.has(t.id)) return;
      picked.add(t.id);
      const qs = shuffle(t.questions).slice(0, Math.min(n, t.questions.length));
      for(const q of qs) qa.push({ topic: t.titleEn || t.titleZh || '', q });
    };
    // 1) 必考题：每次强制抽至少 2 个大题（默认 2，偶尔 3），每个大题 3 小题，且排在最前
    const mustN = Math.min(must.length, randInt(2, 3));
    shuffle(must).forEach((t, i) => { if(i < mustN) takeTopic(t, 3); });
    // 2) 其余：按频率加权再抽 2-3 个大题（超高频/高频占优，低频自然小概率）
    const extraN = randInt(2, 3);
    let guard = 0;
    while(picked.size < mustN + extraN && guard++ < 200) takeTopic(weightedPick(rest), 3);
    return qa;   // 必考在前、其余在后；总小题 = 大题数×3 ≈ 12~18（即「十几个」）
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
        const firstRemain = (snap && rp === 'P1' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < mockState.p1Set.length; i++){
          setMockStep('1');
          setMockSubCount(i+1, mockState.p1Set.length);
          const item = mockState.p1Set[i];
          const qHtml = (item.topic ? '<span class="mock-q-topic">' + escapeHtml(item.topic) + '</span> · ' : '') + escapeHtml(item.q);
          const res = await askQuestion({ phaseLabel:'Part 1（'+(i+1)+' / '+mockState.p1Set.length+'）', qHtml, allowRecord:true, submitLabel:(i===mockState.p1Set.length-1?'完成 P1，进入 P2':'下一题'), resume:{ phase:'P1', index:i, remaining:firstRemain } });
          firstRemain = undefined;
          mockState.answers.push({ part:'P1', q:item.q, transcript:res.transcript });
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
            p3qs = await genP3Questions(topic);
            mockState.p3qs = p3qs;
          }catch(e){
            toast('P3 追问生成失败：' + e.message + '（已跳过 P3）');
            p3qs = [];
          }
        }
        const startIdx = (snap && rp === 'P3') ? snap.index : 0;
        const firstRemain = (snap && rp === 'P3' && snap.remaining != null) ? snap.remaining : undefined;
        for(let i = startIdx; i < p3qs.length; i++){
          setMockStep('3');
          const qHtml = escapeHtml(p3qs[i]);
          const res = await askQuestion({ phaseLabel:'Part 3（'+(i+1)+' / '+p3qs.length+'）', qHtml, allowRecord:true, submitLabel:(i===p3qs.length-1?'完成 P3，出报告':'下一题'), resume: firstRemain != null ? { phase:'P3', index:i, remaining:firstRemain } : undefined });
          firstRemain = undefined;
          mockState.answers.push({ part:'P3', q: p3qs[i], transcript: res.transcript });
          saveResumeSnapshot('P3', i+1);
        }
      }
      await finishExam();
    }catch(e){
      toast('模考中断：' + e.message);
      clearResumeSnapshot();
      const ab = $('#mockAbandonBtn'); if(ab) ab.remove();
      $('#mockStage').hidden = true; $('#mockStart').hidden = false; renderMockStart();
    }
  }

  /* ---------- AI：生成 P3 追问 ---------- */
  async function genP3Questions(p2){
    const sys = 'You are an IELTS speaking examiner. Given a Part 2 cue card topic, generate 4 to 5 abstract Part 3 follow-up questions that explore broader themes (society, comparison, causes, future, individual vs public). Output ONLY a JSON array of question strings in English, no other text.';
    const user = 'Part 2 cue card (English): ' + (p2.promptEn || '') + '\nChinese: ' + (p2.promptZh || '')
      + '\nYou should say: ' + ((p2.youShouldSay || []).join('; '));
    const content = await callRelay('mock_q', [
      { role:'system', content:sys },
      { role:'user', content:user }
    ], 0.8);
    const j = aiJson(content);
    let qs = [];
    if(Array.isArray(j)) qs = j.map(x => (typeof x === 'string' ? x : (x.q || x.question || '')));
    else if(j && Array.isArray(j.questions)) qs = j.questions;
    qs = qs.map(s => String(s).trim()).filter(Boolean);
    if(!qs.length) throw new Error('AI 未返回有效的 P3 追问');
    return qs.slice(0, 5);
  }

  /* ---------- 朗读发音检测（配讯飞 Key 时每 Part 后插入） ---------- */
  /* 参照句库：模考里让考生朗读的英文（通用雅思口语句，足够练发音）。按 Part 随机抽一句。 */

  /* ---------- AI：评分 ---------- */
  async function scoreExam(answers){
    const block = (part) => answers.filter(a => a.part === part)
      .map(a => 'Q: ' + a.q + '\nA: ' + (a.transcript || '(空)')).join('\n\n');
    const sys = "You are an IELTS speaking examiner. Score the candidate's spoken answers (transcribed text) on 5 dimensions, each 0-9 in 0.5 steps: fluency (流利度), taskResponse (扣题/回答是否切题充分), coherence (连贯/衔接), lexical (词汇丰富与准确), grammar (语法 Range 与 accuracy). Do NOT score pronunciation (it is taken from a fixed number the user set in settings). Also write a brief Chinese summary (2-4 sentences) of strengths and weaknesses. Output ONLY JSON: {\"fluency\":x,\"taskResponse\":x,\"coherence\":x,\"lexical\":x,\"grammar\":x,\"summary\":\"...\"} (no pronunciation field). Do not output anything else.";
    const user = 'Part 1:\n' + block('P1') + '\n\nPart 2:\n' + block('P2') + '\n\nPart 3:\n' + block('P3');
    const content = await callRelay('mock_score', [
      { role:'system', content:sys },
      { role:'user', content:user }
    ], 0.4);
    const j = aiJson(content);
    const num = k => { const n = Number(j[k]); return isNaN(n) ? null : n; };
    const d = {
      fluency: num('fluency'),
      taskResponse: num('taskResponse'),
      coherence: num('coherence'),
      lexical: num('lexical'),
      grammar: num('grammar')
    };
    const check = [d.fluency, d.taskResponse, d.coherence, d.lexical, d.grammar];
    if(check.some(v => v == null)){
      throw new Error('AI 评分返回格式异常');
    }
    // overall 由 finishExam 统一计算（发音取固定分）
    return { dims:d, summary:j.summary || '' };
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
      report.dims.pronunciation = pronunciation; // null 表示未设置固定分，不计入
      const vocabGrammar = (report.dims.lexical + report.dims.grammar) / 2;
      if(pronunciation != null){
        report.overall = Math.round(((pronunciation + report.dims.fluency + vocabGrammar + report.dims.coherence) / 4) * 2) / 2;
      } else {
        const parts = [report.dims.fluency, vocabGrammar, report.dims.coherence].filter(v => v != null);
        report.overall = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 2) / 2 : null;
      }
      report.pronMode = source;
      report.pronDetail = null;
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
      dims: report ? report.dims : null,
      p1: mockState.answers.filter(a => a.part === 'P1').map(a => ({ q:a.q, transcript:a.transcript })),
      p2: (() => { const a = mockState.answers.find(x => x.part === 'P2'); return a ? { promptEn: mockState.p2Topic.promptEn, transcript:a.transcript } : null; })(),
      p3: mockState.answers.filter(a => a.part === 'P3').map(a => ({ q:a.q, transcript:a.transcript })),
      summary: report ? report.summary : ''
    };
    DATA.mockRecords.push(rec);
    hubSave(); scheduleCloudUpload();
    renderHistoryArea();

    $('#mockStage').hidden = true;
    $('#mockReport').hidden = false;
    const body = $('#mockReportBody');
    if(body) body.innerHTML = report
      ? window.MockReport.render(report)
      : '<p class="muted">本次评分未完成（AI 接口异常），但你的回答已存入「回顾」。</p>';
    // 模考完成：清理进度快照与「放弃」按钮，下一次进入不再自动续考
    clearResumeSnapshot();
    const ab = $('#mockAbandonBtn'); if(ab) ab.remove();
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
    mockState = { p1Set: buildP1Set(p1), p2Topic: sampleOne(p2), answers: [], pronSource, p3qs: [] };

    $('#mockStart').hidden = true;
    $('#mockReport').hidden = true;
    $('#mockStage').hidden = false;

    await runExam(null);
  }

  /* ---------- 初始化 ---------- */
  function renderHistoryArea(){
    if(!window.MockHistory || typeof window.MockHistory.render !== 'function') return; // 兼容：MockHistory 未注入时跳过
    const list = $('#mockHistoryList');
    if(list){
      window.MockHistory.render(list, { countEl: $('#mockHistCount') });
    }
  }
  ready(async () => {
    await ensureMockLib();
    renderHistoryArea();
    // 断点续考：若上次模考未做完就离开了，返回模考页时自动恢复现场
    const snap = loadResumeSnapshot();
    if(snap){
      mockState = { p1Set: snap.p1Set, p2Topic: snap.p2Topic, answers: snap.answers, pronSource: snap.pronSource, p3qs: snap.p3qs || [] };
      $('#mockStart').hidden = true;
      $('#mockReport').hidden = true;
      $('#mockStage').hidden = false;
      injectAbandonButton();
      toast('已自动恢复上次未完成的模考，继续答题');
      runExam(snap);
    } else {
      renderMockStart();
    }
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
