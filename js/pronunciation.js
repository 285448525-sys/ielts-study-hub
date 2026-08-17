/* === 发音评测页（跟读句子 · 讯飞发音打分） ===
   流程：选句 → 麦克风直采 16k/16bit/单声道 PCM（方案A）→ xfyunEvaluate → 解析 XML → 逐词着色。
   红线：不引新依赖（xfyun.js 已提供鉴权+评测）；不动 mock/speaking/data.js 的数据结构；
   错词进 DATA.words（沿用 {id,en,cn,ts} 形状，与 longsent.js 一致）。 */
(function(){
  /* 内置 IELTS 口语高频句（按主题分类，约 45 句，长度适中、适合跟读纠音） */
  const PRON_SENTENCES = [
    { theme:'学习 · 专业', text:'I am currently majoring in computer science at a local university.' },
    { theme:'学习 · 专业', text:'What I enjoy most about my course is the practical coding projects.' },
    { theme:'学习 · 专业', text:'In my free time, I often read articles about artificial intelligence.' },
    { theme:'学习 · 专业', text:'Group projects help me improve my communication and teamwork skills.' },
    { theme:'学习 · 专业', text:'I plan to work as a software engineer after I graduate.' },

    { theme:'家乡 · 住处', text:'I grew up in a quiet city with beautiful lakes and green hills.' },
    { theme:'家乡 · 住处', text:'The neighborhood where I live is safe, clean, and very peaceful.' },
    { theme:'家乡 · 住处', text:'My apartment is small but cozy, and it has a lovely balcony.' },
    { theme:'家乡 · 住处', text:'What I like most about my hometown is the friendly local people.' },
    { theme:'家乡 · 住处', text:'Public transport in my city is convenient and quite affordable.' },

    { theme:'兴趣 · 爱好', text:'In my spare time, I really enjoy listening to music and singing.' },
    { theme:'兴趣 · 爱好', text:'Playing basketball with my friends is a great way to relax.' },
    { theme:'兴趣 · 爱好', text:'I have been learning to play the guitar for about two years.' },
    { theme:'兴趣 · 爱好', text:'Reading novels helps me forget about stress and daily worries.' },
    { theme:'兴趣 · 爱好', text:'I am a big fan of photography, especially street photography.' },

    { theme:'食物 · 烹饪', text:'I prefer eating fresh fruit and vegetables rather than fast food.' },
    { theme:'食物 · 烹饪', text:'My mother taught me how to cook a few simple homemade dishes.' },
    { theme:'食物 · 烹饪', text:'On weekends, I like to invite friends over for a hotpot dinner.' },
    { theme:'食物 · 烹饪', text:'Tea is my favorite drink because it keeps me calm and focused.' },
    { theme:'食物 · 烹饪', text:'Trying local food is always the best part of traveling abroad.' },

    { theme:'旅行 · 假期', text:'Last summer, I traveled to a small coastal town with my family.' },
    { theme:'旅行 · 假期', text:'I enjoy visiting museums because I can learn about local history.' },
    { theme:'旅行 · 假期', text:'My dream destination is New Zealand because of its stunning nature.' },
    { theme:'旅行 · 假期', text:'Traveling by train is more relaxing than driving for a long trip.' },
    { theme:'旅行 · 假期', text:'A good holiday should balance rest, fun, and a little adventure.' },

    { theme:'科技 · 生活', text:'Smartphones have become an essential part of our daily routines.' },
    { theme:'科技 · 生活', text:'I think social media makes it easier to stay in touch with friends.' },
    { theme:'科技 · 生活', text:'Online learning gives students more flexibility and free choice.' },
    { theme:'科技 · 生活', text:'Technology should serve people, not control how we live.' },
    { theme:'科技 · 生活', text:'I try to limit my screen time before going to bed each night.' },

    { theme:'环境 · 环保', text:'We should take action to reduce plastic waste in daily life.' },
    { theme:'环境 · 环保', text:'Protecting the environment requires effort from both governments and individuals.' },
    { theme:'环境 · 环保', text:'Cycling to school is a healthy and eco-friendly choice.' },
    { theme:'环境 · 环保', text:'Climate change is one of the biggest challenges we face today.' },
    { theme:'环境 · 环保', text:'Planting more trees can help improve the air quality in cities.' },

    { theme:'健康 · 运动', text:'Doing regular exercise helps me stay energetic and clear-minded.' },
    { theme:'健康 · 运动', text:'I believe a balanced diet is more important than strict dieting.' },
    { theme:'健康 · 运动', text:'Yoga and meditation are good ways to lower daily stress.' },
    { theme:'健康 · 运动', text:'I try to drink enough water and sleep at least seven hours.' },
    { theme:'健康 · 运动', text:'Walking in the park after dinner is a simple habit I really enjoy.' },

    { theme:'工作 · 未来', text:'In the future, I hope to start my own small technology company.' },
    { theme:'工作 · 未来', text:'I value a job that gives me both challenge and a sense of purpose.' },
    { theme:'工作 · 未来', text:'Remote work offers flexibility but also needs strong self-discipline.' },
    { theme:'工作 · 未来', text:'Continuous learning is the key to staying competitive at work.' },
    { theme:'工作 · 未来', text:'I would like to live in a bigger city for more career opportunities.' }
  ];

  const state = {
    source:'lib',
    libIdx:0,
    current:null,      // { theme, text }
    recording:false,
    stream:null, ctx:null, processor:null, gain:null, chunks:null,
    timerId:null, recStart:0,
    pcm:null,          // 最近一次录制的 Int16Array
    lastResult:null    // 最近一次解析结果
  };

  /* ---------- 工具：PCM 处理 ---------- */
  function concatFloat(chunks){
    let len = 0; chunks.forEach(c => len += c.length);
    const out = new Float32Array(len);
    let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }
  function resampleFloat(input, fromRate, toRate){
    if(!fromRate || !toRate || fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const newLen = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(newLen);
    for(let i = 0; i < newLen; i++){
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = pos - i0;
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return out;
  }
  function floatTo16(arr){
    const out = new Int16Array(arr.length);
    for(let i = 0; i < arr.length; i++){
      let s = Math.max(-1, Math.min(1, arr[i]));
      out[i] = Math.round(s * 0x7FFF);
    }
    return out;
  }

  /* ---------- 评分颜色 ---------- */
  function scoreColor(s){ if(s == null || isNaN(s)) return 'var(--muted)'; if(s >= 86) return '#1f7a3d'; if(s >= 70) return '#2f7d77'; if(s >= 50) return '#9a7200'; return '#b3261e'; }
  function wordClass(s){ if(s >= 80) return 'good'; if(s >= 60) return 'ok'; return 'bad'; }

  /* ---------- 初始化 ---------- */
  function init(){
    const xf = (DATA.settings && DATA.settings.xfyunIse) || {};
    const hasKey = !!(xf.appid && xf.apiKey && xf.apiSecret);
    const empty = $('#prEmpty'), main = $('#prMain');
    if(!hasKey){ if(empty) empty.style.display = ''; if(main) main.style.display = 'none'; return; }
    if(empty) empty.style.display = 'none';
    if(main) main.style.display = '';

    renderLibrary();
    bindSourceTabs();
    bindWordChips();
    bindControls();
    // 默认载入第一句
    setCurrent(PRON_SENTENCES[0].theme, PRON_SENTENCES[0].text, 0);
  }

  function renderLibrary(){
    const sel = $('#prLibSel'); if(!sel) return;
    // 按主题分组生成 optgroup
    const groups = {};
    PRON_SENTENCES.forEach((s, i) => { (groups[s.theme] = groups[s.theme] || []).push({ i, text:s.text }); });
    let html = '';
    Object.keys(groups).forEach(theme => {
      html += '<optgroup label="' + escapeHtml(theme) + '">';
      groups[theme].forEach(({ i, text }) => { html += '<option value="' + i + '">' + escapeHtml(text) + '</option>'; });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
    sel.addEventListener('change', () => {
      const i = parseInt(sel.value, 10);
      const s = PRON_SENTENCES[i];
      state.libIdx = i;
      setCurrent(s.theme, s.text, i);
    });
  }

  function setCurrent(theme, text, libIdx){
    state.current = { theme, text };
    if(libIdx != null) state.libIdx = libIdx;
    const box = $('#prSentence');
    if(box) box.innerHTML = '<span class="pr-theme">' + escapeHtml(theme) + '</span><span class="pr-text">' + escapeHtml(text) + '</span>';
    clearResult();
  }

  function bindSourceTabs(){
    document.querySelectorAll('.pr-src-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const src = tab.dataset.src;
        state.source = src;
        document.querySelectorAll('.pr-src-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.pr-src-body').forEach(b => b.classList.toggle('active', b.id === 'prSrc' + src.charAt(0).toUpperCase() + src.slice(1)));
        if(src === 'words') renderWordChips();
      });
    });
    const cu = $('#prCustomUse');
    if(cu) cu.addEventListener('click', () => {
      const v = ($('#prCustomInput').value || '').trim();
      if(!v){ toast('请先输入一句英文'); return; }
      setCurrent('自定义', v);
    });
    const wu = $('#prWordsUse');
    if(wu) wu.addEventListener('click', () => {
      const v = ($('#prWordsInput').value || '').trim();
      if(!v){ toast('请先拼一句英文'); return; }
      setCurrent('生词本', v);
    });
  }

  function renderWordChips(){
    const wrap = $('#prWordChips'); if(!wrap) return;
    const words = (DATA.words || []).filter(w => w && w.en);
    if(!words.length){ wrap.innerHTML = '<span class="pr-hint">词库还是空的，去「我的词库」加点词再来练。</span>'; return; }
    wrap.innerHTML = words.map(w => '<span class="pr-word-chip" data-en="' + escapeHtml(w.en) + '">' + escapeHtml(w.en) + '</span>').join('');
    wrap.querySelectorAll('.pr-word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ta = $('#prWordsInput'); if(!ta) return;
        const cur = ta.value.trim();
        ta.value = (cur ? cur + ' ' : '') + chip.dataset.en;
      });
    });
  }
  function bindWordChips(){ /* 渲染在切到该 tab 时触发，这里仅占位（避免重复绑定） */ }

  function bindControls(){
    const recBtn = $('#prRecordBtn');
    if(recBtn) recBtn.addEventListener('click', () => { if(state.recording) stopRecording(); else startRecording(); });
    const next = $('#prNextBtn');
    if(next) next.addEventListener('click', nextSentence);
    const rerec = $('#prRerecBtn');
    if(rerec) rerec.addEventListener('click', () => { clearResult(); startRecording(); });
    const add = $('#prAddWordsBtn');
    if(add) add.addEventListener('click', addWrongWords);
  }

  /* ---------- 录音（方案A：AudioContext 直采 + 重采样到 16k） ---------- */
  async function startRecording(){
    if(state.recording) return;
    if(!state.current){ toast('请先选一句练习句'); return; }
    const status = $('#prStatus');
    setRecUI(true);
    if(status) status.textContent = '录音中…放轻松，照着上面的句子读';
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:1, echoCancellation:true, noiseSuppression:false, autoGainControl:false } });
      state.stream = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ sampleRate: 16000 });
      await ctx.resume();
      state.ctx = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain(); gain.gain.value = 0; // 零增益，防回声
      state.chunks = [];
      processor.onaudioprocess = e => {
        const ch = e.inputBuffer.getChannelData(0);
        state.chunks.push(new Float32Array(ch)); // 必须拷贝
      };
      source.connect(processor); processor.connect(gain); gain.connect(ctx.destination);
      state.processor = processor; state.gain = gain;
      state.recording = true;
      state.recStart = Date.now();
      state.timerId = setInterval(updateTimer, 200);
    }catch(err){
      console.error('[pron] 录音启动失败', err);
      setRecUI(false);
      if(status) status.textContent = '无法访问麦克风（' + (err && err.message ? err.message : '请检查权限') + '）';
      toast('无法访问麦克风');
      cleanupRecording();
    }
  }

  function updateTimer(){
    if(!state.recStart) return;
    const sec = Math.floor((Date.now() - state.recStart) / 1000);
    const el = $('#prTimer');
    if(el) el.textContent = String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
  }

  async function stopRecording(){
    if(!state.recording) return;
    state.recording = false;
    if(state.timerId){ clearInterval(state.timerId); state.timerId = null; }
    const status = $('#prStatus');
    if(status) status.textContent = '评测中…正在把音频发给讯飞';
    setRecUI(false, true); // 评测中：禁用按钮，显示"评测中…"
    const ctx = state.ctx, fromRate = ctx ? ctx.sampleRate : 16000;
    cleanupRecording(); // 断开并关闭音频
    try{
      const floatAll = concatFloat(state.chunks || []);
      state.chunks = null;
      if(floatAll.length < 1600){ // 太短（<0.1s）视为没读
        if(status) status.textContent = '录音太短，请重录并完整朗读句子';
        toast('录音太短，请重录');
        return;
      }
      const resampled = resampleFloat(floatAll, fromRate, 16000);
      const pcm = floatTo16(resampled);
      state.pcm = pcm;
      const xf = DATA.settings.xfyunIse || {};
      const xml = await xfyunEvaluate(pcm, state.current.text, xf);
      const res = parseIse(xml);
      state.lastResult = res;
      renderResult(res);
      if(status) status.textContent = res.rejected ? '未正常朗读，请看提示重读' : '评测完成';
    }catch(err){
      console.error('[pron] 评测失败', err);
      if(status) status.textContent = '评测失败：' + (err && err.message ? err.message : '未知错误');
      toast('评测失败：' + (err && err.message ? err.message : '未知错误'));
    }finally{
      setRecUI(false); // 评测结束：恢复"开始录音"可点
    }
  }

  function cleanupRecording(){
    try{ if(state.processor){ state.processor.disconnect(); state.processor.onaudioprocess = null; } }catch(_){}
    try{ if(state.gain) state.gain.disconnect(); }catch(_){}
    try{ if(state.stream) state.stream.getTracks().forEach(t => t.stop()); }catch(_){}
    try{ if(state.ctx && state.ctx.state !== 'closed') state.ctx.close(); }catch(_){}
    state.stream = state.ctx = state.processor = state.gain = null;
  }

  function setRecUI(recording, busy){
    const btn = $('#prRecordBtn');
    if(!btn) return;
    btn.className = 'pr-rec-btn ' + (recording ? 'stop' : 'start');
    const label = $('#prRecordLabel');
    if(label) label.textContent = recording ? '停止' : (busy ? '评测中…' : '开始录音');
    btn.disabled = !!busy && !recording; // 仅在"评测中且未在录音"时禁用；录音中可点停止
    const timer = $('#prTimer');
    if(timer && !recording) timer.textContent = '00:00';
  }

  /* ---------- 解析讯飞 XML ---------- */
  function parseIse(xml){
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if(doc.querySelector('parsererror')) throw new Error('评测结果解析失败');
    const root = doc.documentElement;
    const rejected = /true/i.test(root.getAttribute('is_rejected') || '');
    const exceptInfo = (root.getAttribute('except_info') || '').trim();

    let node = doc.querySelector('sentence') || doc.querySelector('read_sentence');
    const getScore = (el, name) => {
      if(!el) return null;
      let v = el.getAttribute(name);
      if(v == null){ const c = el.querySelector(name); if(c) v = c.textContent; }
      return (v == null || v === '') ? null : parseFloat(v);
    };
    const total = getScore(node, 'total_score');
    const accuracy = getScore(node, 'accuracy_score');
    const fluency = getScore(node, 'fluency_score');
    const integrity = getScore(node, 'integrity_score');

    const words = [];
    if(node){
      node.querySelectorAll('word').forEach(w => {
        words.push({
          content: (w.getAttribute('content') || '').trim(),
          score: parseFloat(w.getAttribute('total_score') || '0') || 0,
          dp: parseInt(w.getAttribute('dp_message') || '0', 10) || 0
        });
      });
    }
    return { total, accuracy, fluency, integrity, words, rejected, exceptInfo };
  }

  /* ---------- 渲染结果 ---------- */
  function renderResult(res){
    const box = $('#prResult'); if(!box) return;
    let html = '';

    if(res.rejected || res.exceptInfo){
      let reason = res.rejected ? '检测到非朗读内容（乱说 / 与句子无关）' : '';
      if(res.exceptInfo){
        const map = { '28673':'音量太小', '28680':'环境太吵（信噪比低）', '28690':'声音截幅（离麦克风太近/太大声）' };
        reason = (reason ? reason + '；' : '') + '环境异常：' + (map[res.exceptInfo] || ('代码 ' + res.exceptInfo));
      }
      html += '<div class="pr-rejected">⚠️ 本次分数不可信：' + escapeHtml(reason) + '。请调整环境后重录。</div>';
    }

    // 总分环 + 三项小分
    const total = (res.total == null || isNaN(res.total)) ? null : Math.round(res.total);
    const tColor = scoreColor(total);
    html += '<div class="pr-score-head">';
    html += '<div class="pr-total-ring" style="border-color:' + tColor + '"><span class="pr-num" style="color:' + tColor + '">' + (total == null ? '—' : total) + '</span><span class="pr-lab">总分</span></div>';
    html += '<div class="pr-subs">';
    const subs = [['准确度', res.accuracy], ['流畅度', res.fluency], ['完整度', res.integrity]];
    subs.forEach(([lab, v]) => {
      const n = (v == null || isNaN(v)) ? null : Math.round(v);
      const c = scoreColor(n);
      html += '<div class="pr-sub"><div class="pr-sub-num" style="color:' + c + '">' + (n == null ? '—' : n) + '</div><div class="pr-sub-lab">' + lab + '</div></div>';
    });
    html += '</div></div>';

    // 逐词着色
    if(res.words && res.words.length){
      html += '<div class="pr-words">';
      res.words.forEach(w => {
        let cls = wordClass(w.score);
        let dpTag = '';
        if(w.dp === 16){ cls = 'bad'; dpTag = '漏读'; }
        else if(w.dp === 32){ cls = 'bad'; dpTag = '增读'; }
        else if(w.score < 60){ dpTag = '不准'; }
        html += '<span class="pr-word ' + cls + '">' + escapeHtml(w.content) + (dpTag ? '<span class="pr-dp">' + dpTag + '</span>' : '') + '</span>';
      });
      html += '</div>';
      const badCount = res.words.filter(w => w.dp === 16 || w.dp === 32 || w.score < 60).length;
      html += '<p class="pr-hint">共 ' + res.words.length + ' 个词，' + badCount + ' 个需改进（红=不准/漏读/增读）。点「加入错词本」把红词收进生词复习。</p>';
    } else if(!res.rejected && !res.exceptInfo){
      html += '<p class="pr-hint">未解析到逐词结果（可能句子太短或音频质量差）。</p>';
    }

    box.innerHTML = html;
    const actions = $('#prActions'); if(actions) actions.style.display = '';
  }

  function clearResult(){
    const box = $('#prResult');
    if(box) box.innerHTML = '<p class="pr-hint">录完音后，这里会显示总分、三项小分，以及每个词的发音着色（绿=好 / 黄=尚可 / 红=需改），红词下方标注「漏读 / 增读」。</p>';
    const actions = $('#prActions'); if(actions) actions.style.display = 'none';
    state.lastResult = null;
  }

  /* ---------- 下一句 / 重录 / 错词进词库 ---------- */
  function nextSentence(){
    const nextIdx = (state.libIdx + 1) % PRON_SENTENCES.length;
    const s = PRON_SENTENCES[nextIdx];
    state.libIdx = nextIdx;
    const sel = $('#prLibSel');
    if(sel) sel.value = String(nextIdx);
    // 切回句子库 tab，保证来源一致
    state.source = 'lib';
    document.querySelectorAll('.pr-src-tab').forEach(t => t.classList.toggle('active', t.dataset.src === 'lib'));
    document.querySelectorAll('.pr-src-body').forEach(b => b.classList.toggle('active', b.id === 'prSrcLib'));
    setCurrent(s.theme, s.text, nextIdx);
    toast('下一句：' + s.text);
  }

  function addWrongWords(){
    const res = state.lastResult;
    if(!res || !res.words || !res.words.length){ toast('先评测出结果，才能加错词'); return; }
    const wrong = res.words.filter(w => w.dp === 16 || w.dp === 32 || w.score < 60);
    if(!wrong.length){ toast('没有红词，发音很棒！'); return; }
    DATA.words = DATA.words || [];
    let added = 0;
    wrong.forEach(w => {
      const en = (w.content || '').trim();
      if(!en) return;
      const exists = DATA.words.some(x => (x.en || '').toLowerCase() === en.toLowerCase());
      if(exists) return;
      DATA.words.push({ id: uid(), en: en, cn: '（发音评测·' + new Date().toLocaleDateString('zh-CN') + '）', ts: Date.now() });
      added++;
    });
    if(added){ hubSave(); toast('已加入 ' + added + ' 个错词到生词本'); }
    else toast('这些词已在词库里了');
  }

  ready(init);
})();
