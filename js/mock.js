/* 口语模考 · 主控制器（状态机）
   流程：开始卡 → P1(多个大题·每题若干小题·共约十几个) → P2(准备 1min + 陈述 2min) → P3(4-5 题 AI 追问) → 报告
   架构（见执行方案 §1）：
   - 耳朵层：window.MockASR（Web Speech API 本地转写）
   - 大脑层：callRelay → DeepSeek（生成 P3 追问 + 读转写文字评分）
   - 发音分：三来源——配讯飞 Key 则每 Part 后真实朗读检测(ise)；否则用设置固定分(fixed) 或 DeepSeek 文字估算(estimate)，报告里诚实标注
   红线（§7）：不碰 callRelay / DATA.scores；发音分走设置；PAGES 只追加 mock；题库只读。 */
(function(){
  let mockState = null;

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
    const xf = DATA.settings.xfyunIse || {};
    const hasXf = !!(xf.appid && xf.apiKey && xf.apiSecret);
    const fixed = DATA.settings.pronunciationScore;
    const hasKey = !!DATA.settings.relayToken;
    const row = (ok, label, val) =>
      '<div class="mock-precheck-row '+(ok?'ok':'warn')+'">'+label+'：'+(ok?val:'<span class="mock-need">'+val+'</span>')+'</div>';
    let pronVal;
    if(hasXf) pronVal = '已配讯飞 Key → <b>真实评测</b>（每 Part 后朗读检测）';
    else if(fixed != null) pronVal = '未配讯飞 Key → 用设置里的固定分 <b>' + fixed + '</b>（兜底）';
    else pronVal = '未配讯飞 Key → DeepSeek <b>估算</b>（非真实声学）';
    box.innerHTML =
      row(hasXf || fixed != null, '🔊 发音评测', pronVal) +
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

  /* ---------- 各阶段 ---------- */
  async function runP1(set){
    for(let i=0;i<set.length;i++){
      setMockStep('1');
      setMockSubCount(i+1, set.length);
      const item = set[i];
      const qHtml = (item.topic ? '<span class="mock-q-topic">' + escapeHtml(item.topic) + '</span> · ' : '') + escapeHtml(item.q);
      const res = await askQuestion({ phaseLabel:'Part 1（'+(i+1)+' / '+set.length+'）', qHtml, allowRecord:true, submitLabel:(i===set.length-1?'完成 P1，进入 P2':'下一题') });
      mockState.answers.push({ part:'P1', q:item.q, transcript:res.transcript });
    }
  }

  async function startP2(topic){
    setMockStep('2');
    const promptHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + (topic.youShouldSay && topic.youShouldSay.length ? '<div class="mock-p2-say">你应该说到：<ul>' + topic.youShouldSay.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul></div>' : '')
      + '<p class="mock-prephint">你有 1 分钟准备，下方输入框可打草稿（不录音）。时间到或点「结束准备」开始陈述。</p>';
    await askQuestion({ phaseLabel:'Part 2 · 准备（1 min）', qHtml:promptHtml, allowRecord:false, isPrep:true, timeLimit:60, submitLabel:'结束准备，开始陈述' });

    setMockStep('2');
    const talkHtml = '<div class="mock-p2-prompt">' + escapeHtml(topic.promptEn || '')
      + (topic.promptZh ? '<div class="mock-p2-zh">' + escapeHtml(topic.promptZh) + '</div>' : '') + '</div>'
      + '<p class="mock-prephint">现在陈述 2 分钟（可录音）。时间到或点「完成 P2」提交。</p>';
    const talk = await askQuestion({ phaseLabel:'Part 2 · 陈述（2 min）', qHtml:talkHtml, allowRecord:true, timeLimit:120, submitLabel:'完成 P2，进入 P3' });
    mockState.answers.push({ part:'P2', q:topic.promptEn || '', transcript:talk.transcript });
  }

  async function runP3(qs){
    for(let i=0;i<qs.length;i++){
      setMockStep('3');
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

  /* ---------- 朗读发音检测（配讯飞 Key 时每 Part 后插入） ---------- */
  /* 参照句库：模考里让考生朗读的英文（通用雅思口语句，足够练发音）。按 Part 随机抽一句。 */
  const PRON_REF_SENTENCES = [
    "I believe that travelling to new places can broaden our horizons and change the way we think.",
    "In my opinion, a balanced lifestyle is far more important than simply chasing high grades or money.",
    "What I enjoy most is spending time with my family, because it makes me feel relaxed and supported.",
    "Technology has changed our daily lives in many ways, both positive and negative.",
    "I think the most important quality for a friend is honesty, followed by a good sense of humour.",
    "Protecting the environment is a shared responsibility that everyone should take seriously."
  ];
  function pickPronRef(){
    return PRON_REF_SENTENCES[Math.floor(Math.random() * PRON_REF_SENTENCES.length)];
  }

  function renderPronResult(res, el){
    if(!el) return;
    let html = '';
    if(res.rejected || res.exceptInfo){
      const map = { '28673':'音量太小', '28680':'环境太吵（信噪比低）', '28690':'声音截幅（离麦克风太近/太大声）' };
      let reason = res.rejected ? '检测到非朗读内容' : '';
      if(res.exceptInfo) reason = (reason ? reason + '；' : '') + '环境异常：' + (map[res.exceptInfo] || ('代码 ' + res.exceptInfo));
      html += '<div class="mock-pron-rejected">⚠️ 本次分数不可信：' + escapeHtml(reason) + '。可重录。</div>';
    }
    const sub = (lab, v) => {
      const n = (v == null || isNaN(v)) ? null : Math.round(v);
      const c = n == null ? 'var(--muted)' : (n >= 86 ? '#1f7a3d' : n >= 70 ? '#2f7d77' : n >= 50 ? '#9a7200' : '#b3261e');
      return '<div class="mock-pron-sub"><div class="mock-pron-sub-n" style="color:' + c + '">' + (n == null ? '—' : n) + '</div><div class="mock-pron-sub-l">' + lab + '</div></div>';
    };
    html += '<div class="mock-pron-subs">' + sub('准确度', res.accuracy) + sub('流畅度', res.fluency) + sub('完整度', res.integrity) + '</div>';
    if(res.words && res.words.length){
      html += '<div class="mock-pron-words">';
      res.words.forEach(w => {
        let cls = 'good', tag = '';
        if(w.dp === 16){ cls = 'bad'; tag = '漏读'; }
        else if(w.dp === 32){ cls = 'bad'; tag = '增读'; }
        else if(w.score < 60){ cls = 'bad'; tag = '不准'; }
        else if(w.score < 80){ cls = 'ok'; }
        html += '<span class="mock-pron-word ' + cls + '">' + escapeHtml(w.content || '') + (tag ? '<span class="dp">' + tag + '</span>' : '') + '</span>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
  }

  /* 朗读检测：展示参照句 → 录音 → 讯飞评测 → 逐词着色；完成后 resolve。
     隐藏答题卡，避免与当前题目混淆。 */
  function runPronDetect(partLabel){
    return new Promise(resolve => {
      const detect = $('#mockPronDetect'), qcard = $('#mockQCard');
      const head = $('#mockPronHead'), refEl = $('#mockPronRef'), recBtn = $('#mockPronRecBtn');
      const timerEl = $('#mockPronTimer'), statusEl = $('#mockPronStatus'), resultEl = $('#mockPronResult');
      const doneBtn = $('#mockPronDone'), skipBtn = $('#mockPronSkip');
      if(!detect || !qcard){ resolve(); return; }
      const refText = pickPronRef();
      if(head) head.textContent = '🔊 朗读发音检测（' + partLabel + '）';
      if(refEl) refEl.textContent = refText;
      if(resultEl) resultEl.innerHTML = '';
      if(statusEl) statusEl.textContent = '录完你读的这句，讯飞会逐词打分';
      if(timerEl) timerEl.textContent = '00:00';
      if(recBtn){ recBtn.textContent = '🎙 开始录音'; recBtn.disabled = false; }
      qcard.hidden = true; detect.hidden = false;
      setPhase(partLabel + ' · 朗读检测');

      let recorder = null, timerId = null, recStart = 0, done = false;
      const finish = () => {
        if(done) return; done = true;
        if(timerId){ clearInterval(timerId); timerId = null; }
        if(recorder){ try{ recorder.cancel(); }catch(_){} recorder = null; }
        detect.hidden = true; qcard.hidden = false;
        resolve();
      };
      const startTimer = () => { recStart = Date.now(); timerId = setInterval(() => { const s = Math.floor((Date.now() - recStart) / 1000); if(timerEl) timerEl.textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }, 200); };

      if(recBtn) recBtn.onclick = async () => {
        if(recorder){
          const r = recorder; recorder = null; // 立即置空，避免重复 stop
          recBtn.disabled = true;
          try{
            const pcm = await r.stop();
            if(timerId){ clearInterval(timerId); timerId = null; }
            if(!pcm || pcm.length < 1600){ if(statusEl) statusEl.textContent = '录音太短，请重录'; recBtn.disabled = false; recBtn.textContent = '🎙 开始录音'; return; }
            if(statusEl) statusEl.textContent = '评测中…';
            const xf = DATA.settings.xfyunIse || {};
            try{
              const xml = await xfyunEvaluate(pcm, refText, xf);
              const res = parseIseXml(xml);
              renderPronResult(res, resultEl);
              mockState.pronParts.push({ part: partLabel, refText, accuracy: res.accuracy, fluency: res.fluency, integrity: res.integrity, words: res.words, rejected: res.rejected, exceptInfo: res.exceptInfo });
              if(statusEl) statusEl.textContent = res.rejected ? '未正常朗读，可重录或跳过' : '评测完成，点「完成检测」继续';
              recBtn.textContent = '🎙 重录'; recBtn.disabled = false;
            }catch(e){ if(statusEl) statusEl.textContent = '评测失败：' + (e && e.message ? e.message : '未知'); recBtn.textContent = '🎙 重录'; recBtn.disabled = false; }
          }catch(e){ if(statusEl) statusEl.textContent = '录音失败：' + (e && e.message ? e.message : '未知'); recBtn.disabled = false; recBtn.textContent = '🎙 开始录音'; }
          return;
        }
        // 开始录音
        try{
          recorder = startPcmRecord();
          await recorder.ready;
          if(recBtn) recBtn.textContent = '⏹ 停止';
          if(statusEl) statusEl.textContent = '录音中…朗读上面的句子';
          startTimer();
        }catch(e){ if(statusEl) statusEl.textContent = '无法访问麦克风：' + (e && e.message ? e.message : '请检查权限'); recorder = null; }
      };
      if(doneBtn) doneBtn.onclick = finish;
      if(skipBtn) skipBtn.onclick = finish;
    });
  }

  /* ---------- AI：评分 ---------- */
  async function scoreExam(answers, needPronEst){
    const block = (part) => answers.filter(a => a.part === part)
      .map(a => 'Q: ' + a.q + '\nA: ' + (a.transcript || '(空)')).join('\n\n');
    const pronInst = needPronEst
      ? ' Also estimate pronunciation on a 0-9 scale as "pronunciation":x — this is a TEXT-BASED ESTIMATE of how the speech likely sounded (not an acoustic measurement), inferred from vocabulary and phoneme clues in the transcript.'
      : ' Pronunciation is assessed by a separate acoustic tool, so do NOT include a pronunciation field.';
    const sys = "You are an IELTS speaking examiner. Score the candidate's spoken answers (transcribed text) on 5 dimensions, each 0-9 in 0.5 steps: fluency (流利度), taskResponse (扣题/回答是否切题充分), coherence (连贯/衔接), lexical (词汇丰富与准确), grammar (语法 Range 与 accuracy)." + pronInst + " Also write a brief Chinese summary (2-4 sentences) of strengths and weaknesses. Output ONLY JSON: {\"fluency\":x,\"taskResponse\":x,\"coherence\":x,\"lexical\":x,\"grammar\":x,\"summary\":\"...\"} (add \"pronunciation\":x only when instructed). Do not output anything else.";
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
      grammar: num('grammar'),
      pronunciation: needPronEst ? num('pronunciation') : null
    };
    const check = needPronEst
      ? [d.fluency, d.taskResponse, d.coherence, d.lexical, d.grammar, d.pronunciation]
      : [d.fluency, d.taskResponse, d.coherence, d.lexical, d.grammar];
    if(check.some(v => v == null)){
      throw new Error('AI 评分返回格式异常');
    }
    // overall 由 finishExam 按发音来源统一计算（此处只返回各维度原始分）
    return { dims:d, summary:j.summary || '' };
  }

  /* ---------- 收尾：报告 + 落库 ---------- */
  async function finishExam(){
    setPhase('评分中…');
    const source = mockState.pronSource;
    // 发音分：ise=各 Part 朗读检测准确度均值；fixed=设置固定分；estimate=DeepSeek 估算
    let pronunciation = null;
    if(source === 'ise'){
      const accs = mockState.pronParts.map(p => p.accuracy).filter(v => v != null);
      pronunciation = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length * 10) / 10 : null;
    } else if(source === 'fixed'){
      pronunciation = Number(DATA.settings.pronunciationScore);
    }
    const needEst = (source === 'estimate');
    let report = null;
    try{
      report = await scoreExam(mockState.answers, needEst);
      if(source === 'estimate' && report) pronunciation = report.dims.pronunciation;
    }catch(e){
      toast('AI 评分失败：' + e.message + '（回答已保存，可稍后在「回顾」查看）');
    }
    // 兜底：发音仍为空 → 若有设置固定分则用
    if(pronunciation == null && DATA.settings.pronunciationScore != null) pronunciation = Number(DATA.settings.pronunciationScore);

    if(report){
      report.dims.pronunciation = pronunciation;
      const vocabGrammar = (report.dims.lexical + report.dims.grammar) / 2;
      if(pronunciation != null){
        report.overall = Math.round(((pronunciation + report.dims.fluency + vocabGrammar + report.dims.coherence) / 4) * 2) / 2;
      } else {
        const parts = [report.dims.fluency, vocabGrammar, report.dims.coherence].filter(v => v != null);
        report.overall = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 2) / 2 : null;
      }
      report.pronMode = source;
      report.pronDetail = (source === 'ise') ? mockState.pronParts : null;
    }

    const rec = {
      id: uid(),
      ts: Date.now(),
      kind: 'speaking',
      date: todayKey(),
      overall: report ? report.overall : null,
      pronunciationScore: pronunciation,
      pronMode: source,
      pronDetail: (source === 'ise') ? mockState.pronParts : null,
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
  }

  /* ---------- 主流程 ---------- */
  async function startExam(){
    if(!DATA.settings.relayToken){
      toast('请先在「设置 / AI 接口」填写 DeepSeek Key'); return;
    }
    const p1 = DATA.speaking.filter(x => x.type === 'P1' && x.questions && x.questions.length);
    const p2 = DATA.speaking.filter(x => x.type === 'P2' && x.promptEn);
    if(!p1.length || !p2.length){ toast('口语题库为空，无法模考'); return; }

    // 发音来源：配讯飞 Key → 真实评测(ise)；否则有固定分用固定(fixed)，都没 → DeepSeek 估算(estimate)
    const xf = DATA.settings.xfyunIse || {};
    const hasXf = !!(xf.appid && xf.apiKey && xf.apiSecret);
    const fixed = DATA.settings.pronunciationScore;
    const pronSource = hasXf ? 'ise' : (fixed != null ? 'fixed' : 'estimate');
    mockState = { p1Set: buildP1Set(p1), p2Topic: sampleOne(p2), answers: [], pronSource, pronParts: [] };

    $('#mockStart').hidden = true;
    $('#mockReport').hidden = true;
    $('#mockStage').hidden = false;

    try{
      await runP1(mockState.p1Set);
      if(pronSource === 'ise') await runPronDetect('Part 1');
      await startP2(mockState.p2Topic);
      if(pronSource === 'ise') await runPronDetect('Part 2');
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
      if(pronSource === 'ise') await runPronDetect('Part 3');
      await finishExam();
    }catch(e){
      toast('模考中断：' + e.message);
      if(window.MockASR) window.MockASR.abort();
      $('#mockStage').hidden = true; $('#mockStart').hidden = false; renderMockStart();
    }
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
