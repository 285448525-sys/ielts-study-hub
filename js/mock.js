/* 口语模考 · 主控制器（状态机）
   流程：开始卡 → P1(4 题) → P2(准备 1min + 陈述 2min) → P3(4-5 题 AI 追问) → 报告
   架构（见执行方案 §1）：
   - 耳朵层：window.MockASR（Web Speech API 本地转写）
   - 大脑层：callRelay → DeepSeek（生成 P3 追问 + 读转写文字评分）
   - 发音分：DATA.settings.pronunciationScore（用户自设固定分，快照入记录）
   红线（§7）：不碰 callRelay / DATA.scores；发音分走设置；PAGES 只追加 mock；题库只读。 */
(function(){
  let mockState = null;

  /* ---------- 工具 ---------- */
  function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function sampleOne(a){ return a[Math.floor(Math.random()*a.length)]; }
  function fmtClock(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  function setPhase(t){ const el=$('#mockPhase'); if(el) el.textContent=t; }

  /* 软导航只 eval js/mock.js，head 里的 mock-asr/mock-report 不会被重新执行，
     故在此动态注入这两个库（带缓存，避免重复加载），直接访问也有（head defer 已加载）。 */
  function ensureMockLib(){
    return new Promise(resolve => {
      const done = () => { if(window.MockASR && window.MockReport) resolve(); };
      if(window.MockASR && window.MockReport) return resolve();
      let pending = 0;
      ['js/mock-asr.js','js/mock-report.js'].forEach(src => {
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
    const pron = DATA.settings.pronunciationScore;
    const hasKey = !!DATA.settings.relayToken;
    const row = (ok, label, val) =>
      '<div class="mock-precheck-row '+(ok?'ok':'warn')+'">'+label+'：'+(ok?val:'<span class="mock-need">'+val+'</span>')+'</div>';
    box.innerHTML =
      row(pron!=null, '🔊 发音分', pron!=null ? ('<b>'+pron+'</b> / 9') : '未设置（<a href="settings.html">去设置填</a>）') +
      row(hasKey, '🤖 AI 接口', hasKey ? '已配置 DeepSeek Key' : '未配置（<a href="settings.html">去设置填</a>）');
  }

  /* ---------- 单题交互（录音 + 手动兜底 + 可选计时）---------- */
  function askQuestion(opts){
    return new Promise(resolve => {
      if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
      setPhase(opts.phaseLabel || '');
      const qEl = $('#mockQ'); if(qEl) qEl.innerHTML = opts.qHtml || '';
      const liveEl = $('#mockLive'); if(liveEl) liveEl.textContent = '';
      const manual = $('#mockManual'); if(manual) manual.value = '';
      const hint = $('#mockHint'); if(hint) hint.textContent = '';
      const recBtn = $('#mockRecBtn');
      const submitBtn = $('#mockSubmit');
      const timerWrap = $('#mockTimerWrap');
      const timerEl = $('#mockTimer');
      if(recBtn) recBtn.dataset.on = '0';

      let resolved = false;

      // 录音按钮
      const canRec = opts.allowRecord && window.MockASR && window.MockASR.isSupported();
      if(recBtn){
        if(canRec){
          recBtn.hidden = false; recBtn.textContent = '🎙 开始录音';
          recBtn.onclick = () => {
            if(recBtn.dataset.on === '1'){
              const r = window.MockASR.stop();
              recBtn.dataset.on = '0'; recBtn.textContent = '🎙 开始录音';
              if(liveEl && r && r.transcript) liveEl.textContent = r.transcript;
              if(hint) hint.textContent = '已停止录音，可在下方输入框修正后提交。';
            } else {
              if(liveEl) liveEl.textContent = '聆听中…';
              const res = window.MockASR.start({
                onText:(text) => { if(liveEl) liveEl.textContent = text; },
                onError:(e) => { if(hint) hint.textContent = '录音出错（' + e + '），请改用下方手动输入。'; }
              });
              if(res && res.supported){ recBtn.dataset.on = '1'; recBtn.textContent = '⏹ 停止录音'; }
              else if(hint) hint.textContent = '当前浏览器不支持录音，请直接在下方输入你说的内容。';
            }
          };
        } else {
          recBtn.hidden = true;
          if(hint && opts.allowRecord) hint.textContent = '当前浏览器不支持语音识别，请用下方输入框手动粘贴你说的内容。';
        }
      }

      // 计时（P2 准备 / 陈述）
      if(opts.timeLimit && timerWrap && timerEl){
        timerWrap.hidden = false;
        let left = opts.timeLimit;
        timerEl.textContent = fmtClock(left);
        window.__mockTick = setInterval(() => {
          left--;
          if(left <= 0){
            clearInterval(window.__mockTick); window.__mockTick = null;
            timerEl.textContent = '00:00';
            if(hint) hint.textContent = opts.isPrep ? '准备时间到，可以开始陈述了。' : '时间到，请提交你刚才的回答。';
            if(window.MockASR && recBtn && recBtn.dataset.on === '1'){
              const r = window.MockASR.stop();
              recBtn.dataset.on = '0'; recBtn.textContent = '🎙 开始录音';
              if(liveEl && r && r.transcript) liveEl.textContent = r.transcript;
            }
          } else {
            timerEl.textContent = fmtClock(left);
          }
        }, 1000);
      } else if(timerWrap){
        timerWrap.hidden = true;
      }

      // 提交
      if(submitBtn){
        submitBtn.textContent = opts.submitLabel || '提交 / 下一题';
        submitBtn.onclick = () => {
          if(resolved) return;
          resolved = true;
          if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
          let transcript = '';
          if(window.MockASR && recBtn && recBtn.dataset.on === '1'){
            const r = window.MockASR.stop();
            recBtn.dataset.on = '0'; recBtn.textContent = '🎙 开始录音';
            if(r && r.transcript) transcript = r.transcript;
          }
          if(!transcript && liveEl) transcript = liveEl.textContent.trim();
          if(!transcript && manual) transcript = manual.value.trim();
          resolve({ transcript: transcript });
        };
      }
    });
  }

  /* ---------- 题库抽样 ---------- */
  function buildP1Set(pool){
    const shuffled = shuffle(pool);
    const qa = [];
    const mk = (t, q) => ({ topic: t.titleEn || t.titleZh || '', q: q });
    // 先从第一个话题拿 2 题（保持连贯），再从其余话题各拿 1 题，凑到 4 题（更丰富）
    if(shuffled[0]){
      const qs = shuffle(shuffled[0].questions);
      for(const q of qs){ if(qa.length >= 2) break; qa.push(mk(shuffled[0], q)); }
    }
    for(let i = 1; i < shuffled.length && qa.length < 4; i++){
      const q = shuffle(shuffled[i].questions)[0];
      if(q) qa.push(mk(shuffled[i], q));
    }
    return qa.slice(0, 4);
  }

  /* ---------- 各阶段 ---------- */
  async function runP1(set){
    for(let i=0;i<set.length;i++){
      const item = set[i];
      const qHtml = (item.topic ? '<span class="mock-q-topic">' + escapeHtml(item.topic) + '</span> · ' : '') + escapeHtml(item.q);
      const res = await askQuestion({ phaseLabel:'Part 1（'+(i+1)+' / '+set.length+'）', qHtml, allowRecord:true, submitLabel:(i===set.length-1?'完成 P1，进入 P2':'下一题') });
      mockState.answers.push({ part:'P1', q:item.q, transcript:res.transcript });
    }
  }

  async function startP2(topic){
    const promptHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + (topic.youShouldSay && topic.youShouldSay.length ? '<div class="mock-p2-say">你应该说到：<ul>' + topic.youShouldSay.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul></div>' : '')
      + '<p class="mock-prephint">你有 1 分钟准备，下方输入框可打草稿（不录音）。时间到或点「结束准备」开始陈述。</p>';
    await askQuestion({ phaseLabel:'Part 2 · 准备（1 min）', qHtml:promptHtml, allowRecord:false, isPrep:true, timeLimit:60, submitLabel:'结束准备，开始陈述' });

    const talkHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + '<p class="mock-prephint">现在陈述 2 分钟（可录音）。时间到或点「完成 P2」提交。</p>';
    const talk = await askQuestion({ phaseLabel:'Part 2 · 陈述（2 min）', qHtml:talkHtml, allowRecord:true, timeLimit:120, submitLabel:'完成 P2，进入 P3' });
    mockState.answers.push({ part:'P2', q:topic.promptEn || '', transcript:talk.transcript });
  }

  async function runP3(qs){
    for(let i=0;i<qs.length;i++){
      const qHtml = escapeHtml(qs[i]);
      const res = await askQuestion({ phaseLabel:'Part 3（'+(i+1)+' / '+qs.length+'）', qHtml, allowRecord:true, submitLabel:(i===qs.length-1?'完成 P3，出报告':'下一题') });
      mockState.answers.push({ part:'P3', q:qs[i], transcript:res.transcript });
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

  /* ---------- AI：评分 ---------- */
  async function scoreExam(answers, pronScore){
    const block = (part) => answers.filter(a => a.part === part)
      .map(a => 'Q: ' + a.q + '\nA: ' + (a.transcript || '(空)')).join('\n\n');
    const sys = "You are an IELTS speaking examiner. Score the candidate's spoken answers (transcribed text) on 5 dimensions, each 0-9 in 0.5 steps: fluency (流利度), taskResponse (扣题/回答是否切题充分), coherence (连贯/衔接), lexical (词汇丰富与准确), grammar (语法 Range 与 accuracy). Also write a brief Chinese summary (2-4 sentences) of strengths and weaknesses. Output ONLY JSON: {\"fluency\":x,\"taskResponse\":x,\"coherence\":x,\"lexical\":x,\"grammar\":x,\"summary\":\"...\"} . Pronunciation is assessed separately by the user, do NOT include it. Do not output anything else.";
    const user = 'Part 1:\n' + block('P1') + '\n\nPart 2:\n' + block('P2') + '\n\nPart 3:\n' + block('P3');
    const content = await callRelay('mock_score', [
      { role:'system', content:sys },
      { role:'user', content:user }
    ], 0.4);
    const j = aiJson(content);
    const num = k => { const n = Number(j[k]); return isNaN(n) ? null : n; };
    const d = {
      pronunciation: pronScore,
      fluency: num('fluency'),
      taskResponse: num('taskResponse'),
      coherence: num('coherence'),
      lexical: num('lexical'),
      grammar: num('grammar')
    };
    if([d.fluency, d.taskResponse, d.coherence, d.lexical, d.grammar].some(v => v == null)){
      throw new Error('AI 评分返回格式异常');
    }
    // overall = 雅思四官方维度四等分平均：发音 / 流利度 / 词汇语法(词+法平均) / 连贯
    const vocabGrammar = (d.lexical + d.grammar) / 2;
    const overall = Math.round(((d.pronunciation + d.fluency + vocabGrammar + d.coherence) / 4) * 2) / 2;
    return { dims:d, overall, summary:j.summary || '' };
  }

  /* ---------- 收尾：报告 + 落库 ---------- */
  async function finishExam(){
    setPhase('评分中…');
    const pron = Number(mockState.pronScore);
    let report = null;
    try{
      report = await scoreExam(mockState.answers, pron);
    }catch(e){
      toast('AI 评分失败：' + e.message + '（回答已保存，可稍后在「回顾」查看）');
    }
    const rec = {
      id: uid(),
      date: todayKey(),
      overall: report ? report.overall : null,
      pronunciationScore: pron,
      dims: report ? report.dims : null,
      p1: mockState.answers.filter(a => a.part === 'P1').map(a => ({ q:a.q, transcript:a.transcript })),
      p2: (() => { const a = mockState.answers.find(x => x.part === 'P2'); return a ? { promptEn: mockState.p2Topic.promptEn, transcript:a.transcript } : null; })(),
      p3: mockState.answers.filter(a => a.part === 'P3').map(a => ({ q:a.q, transcript:a.transcript })),
      summary: report ? report.summary : ''
    };
    DATA.mockRecords.push(rec);
    hubSave(); scheduleCloudUpload();

    $('#mockStage').hidden = true;
    $('#mockReport').hidden = false;
    const body = $('#mockReportBody');
    if(body) body.innerHTML = report
      ? window.MockReport.render({ dims:report.dims, overall:report.overall, summary:report.summary })
      : '<p class="muted">本次评分未完成（AI 接口异常），但你的回答已存入「回顾」。</p>';
  }

  /* ---------- 主流程 ---------- */
  async function startExam(){
    if(DATA.settings.pronunciationScore == null || DATA.settings.pronunciationScore === ''){
      toast('请先在「设置」填写你的发音分'); renderMockStart(); return;
    }
    if(!DATA.settings.relayToken){
      toast('请先在「设置 / AI 接口」填写 DeepSeek Key'); return;
    }
    const p1 = DATA.speaking.filter(x => x.type === 'P1' && x.questions && x.questions.length);
    const p2 = DATA.speaking.filter(x => x.type === 'P2' && x.promptEn);
    if(!p1.length || !p2.length){ toast('口语题库为空，无法模考'); return; }

    mockState = { p1Set: buildP1Set(p1), p2Topic: sampleOne(p2), answers: [], pronScore: Number(DATA.settings.pronunciationScore) };

    $('#mockStart').hidden = true;
    $('#mockReport').hidden = true;
    $('#mockStage').hidden = false;

    try{
      await runP1(mockState.p1Set);
      await startP2(mockState.p2Topic);

      let p3qs = [];
      try{
        setPhase('Part 3');
        $('#mockQ').innerHTML = '正在生成 P3 追问…';
        p3qs = await genP3Questions(mockState.p2Topic);
      }catch(e){
        toast('P3 追问生成失败：' + e.message + '（已跳过 P3）');
        p3qs = [];
      }
      if(p3qs.length) await runP3(p3qs);

      await finishExam();
    }catch(e){
      toast('模考中断：' + e.message);
      if(window.MockASR) window.MockASR.abort();
      $('#mockStage').hidden = true; $('#mockStart').hidden = false; renderMockStart();
    }
  }

  /* ---------- 初始化 ---------- */
  ready(async () => {
    await ensureMockLib();
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
    renderMockStart();
  });
})();
