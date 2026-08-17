/* === 讯飞语音评测（发音打分）· 浏览器直连 WebSocket ===
   纯前端：HMAC-SHA256 签名 + wss 流式评测，无后端、无密钥泄漏风险（自用）。
   端点：wss://ise-api.xfyun.cn/v2/open-ise
   参考：ielts_pronunciation_eval.md 第三节
   注意：crypto.subtle 需要安全上下文（HTTPS 或 localhost）；file:// 直开不可用。
*/

/* UTF-8 字符串 → Base64 */
function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for(let i = 0; i < bytes.length; i += chunk){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* HMAC-SHA256(secret) → Base64（Web Crypto） */
async function hmacSha256Base64(message, secret){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for(let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* 构造握手 URL（带鉴权参数） */
async function xfyunAuthUrl(cfg){
  if(!window.crypto || !crypto.subtle){
    throw new Error('当前环境不支持加密（需 HTTPS 或 localhost，不能用 file:// 直开）');
  }
  const host = 'ise-api.xfyun.cn';
  const date = new Date().toUTCString(); // RFC1123 GMT，如 Wed, 10 Jul 2019 07:35:43 GMT
  const signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET /v2/open-ise HTTP/1.1';
  const signature = await hmacSha256Base64(signatureOrigin, cfg.apiSecret);
  const authorizationOrigin = 'api_key="' + cfg.apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
  const authorization = utf8ToBase64(authorizationOrigin);
  return 'wss://' + host + '/v2/open-ise'
    + '?authorization=' + encodeURIComponent(authorization)
    + '&date=' + encodeURIComponent(date)
    + '&host=' + host;
}

/* Int16 PCM → Base64 */
function int16ToBase64(int16){
  const u8 = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = '';
  const chunk = 0x8000;
  for(let i = 0; i < u8.length; i += chunk){
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* 从讯飞返回（可能是嵌套 JSON 或裸 XML）里抽出评测 XML 文本。
   容错：外层 data 是 base64(JSON)，JSON 里某一层 data 又是 base64(XML)，递归找能解出 '<' 的字符串。 */
function xfyunFindXml(decoded){
  if(typeof decoded === 'string' && decoded.trim().startsWith('<')) return decoded;
  let obj;
  try{ obj = JSON.parse(decoded); }catch(_){ return null; }
  let found = null;
  const walk = (v) => {
    if(found) return;
    if(typeof v === 'string'){
      try{ const t = atob(v); if(t.trim().startsWith('<')) found = t; }catch(_){}
    } else if(Array.isArray(v)){ v.forEach(walk); }
    else if(v && typeof v === 'object'){ Object.values(v).forEach(walk); }
  };
  walk(obj);
  return found;
}

/* 评测：pcm=Int16Array(16k/16bit/mono)，refText=参照文本（朗读句），cfg={appid,apiKey,apiSecret}
   返回：评测结果 XML 字符串（result 字段 base64 解码拼接）。失败时 reject(Error)。 */
function xfyunEvaluate(pcm, refText, cfg){
  return new Promise(async (resolve, reject) => {
    let url;
    try{ url = await xfyunAuthUrl(cfg); }
    catch(e){ reject(new Error('签名失败：' + e.message)); return; }

    let ws;
    try{ ws = new WebSocket(url); }
    catch(e){ reject(new Error('无法建立连接：' + e.message)); return; }

    let xml = '';
    let done = false;
    let lastServerMsg = '';
    const finish = (err, val) => {
      if(done) return; done = true;
      try{ ws.close(); }catch(_){}
      if(err) reject(err); else resolve(val);
    };

    // 状态：connecting -> ssb_sent -> audio -> result
    let state = 'ssb_sent';

    const sendAudioFrames = (pcm) => {
      // 官方推荐每 40ms 一帧：16000Hz * 16bit * 0.04s / 8 = 1280 字节 = 640 Int16 样本
      const chunkSamples = 640;
      const sendChunk = (audio, status, aus) => {
        // 官方 ISE 文档 audio 帧结构：business 只含 cmd/aus；data 只含 status/data
        if(ws.readyState !== WebSocket.OPEN) return;
        const frame = {
          business: { cmd:'auw', aus },
          data: { status, data: audio }
        };
        if(typeof console !== 'undefined' && console.log) console.log('[xfyun] send audio frame', { aus, status, len: audio.length });
        ws.send(JSON.stringify(frame));
      };
      if(!pcm || pcm.length === 0){
        // 无音频（仅测握手）：只发结束帧 aus=4, status=2
        try{ sendChunk('', 2, 4); }catch(e){ finish(new Error('发送末帧失败：' + e.message)); }
        return;
      }
      const total = pcm.length;
      let sent = 0;
      // 按 40ms 间隔逐帧发送，模拟实时音频流，避免一次性灌入导致服务端关闭
      const step = () => {
        if(done) return;
        const isFirst = (sent === 0);
        const end = Math.min(sent + chunkSamples, total);
        const isLast = (end === total);
        const slice = pcm.subarray(sent, end);
        const audio = int16ToBase64(slice);
        try{
          if(isFirst && !isLast){
            sendChunk(audio, 1, 1); // 首音频帧
          } else if(isLast){
            sendChunk(audio, 2, 4); // 尾音频帧（status=2, aus=4）
          } else {
            sendChunk(audio, 1, 2); // 中间帧
          }
        }catch(e){ finish(new Error('发送音频失败：' + e.message)); return; }
        sent = end;
        if(sent < total) setTimeout(step, 40);
      };
      step();
    };

    ws.onopen = () => {
      try{
      // 官方 ISE 流式文档（英文 read_sentence）：
      // 1. text 必须是「UTF-8 BOM 前缀 + '[content]' + 原始文本」，不能 urlencode；
      // 2. tte 为必传字段（文本编码）。
      // text 被 urlencode / 缺 BOM / 缺 [content] / 缺 tte 都会导致引擎识别流异常，
      // 进而所有音频帧 append 失败 → 48195(iSEInputAppend/ret=8195)。
      const ssbFrame = {
        common: { app_id: cfg.appid },
        business: {
          category:'read_sentence',
          sub:'ise',
          ent:'en_vip',
          cmd:'ssb',
          text: '\uFEFF[content]' + refText,
          tte:'utf-8',
          ttp_skip:true,
          aue:'raw',
          auf:'audio/L16;rate=16000',
          plev:'0.5'
        },
        data: { status: 0 }
      };
      if(typeof console !== 'undefined' && console.log) console.log('[xfyun] send ssb frame', JSON.parse(JSON.stringify(ssbFrame)));
      ws.send(JSON.stringify(ssbFrame));
      }catch(e){ finish(new Error('发送首帧失败：' + e.message)); return; }
      // 音频帧需等 ssb 握手回包后再发
    };

    ws.onmessage = (ev) => {
      if(typeof console !== 'undefined' && console.log) console.log('[xfyun] recv', ev.data);
      let outer;
      try{ outer = JSON.parse(ev.data); }catch(_){ return; }
      lastServerMsg = ev.data;

      const code = outer.code;
      if(code !== undefined && String(code) !== '0'){
        finish(new Error('讯飞错误 ' + code + '：' + (outer.message || '未知错误')));
        return;
      }

      // ssb 握手确认：收到首个 code=0 的回包即可开始传音频
      if(state === 'ssb_sent'){
        state = 'audio';
        sendAudioFrames(pcm);
        return;
      }
      if(state !== 'audio') return;

      // 服务端结果结构：outer.data = { status:int, data: base64(xml) }
      const payload = (outer.data && typeof outer.data === 'object') ? outer.data.data : outer.data;
      if(typeof payload !== 'string' || !payload) return;
      let decoded;
      try{ decoded = atob(payload); }catch(_){ return; }
      // decoded 可能是嵌套 JSON 或裸 XML，统一抽出评测 XML 文本
      const xmlResult = xfyunFindXml(decoded);
      if(xmlResult) xml = xmlResult;
      // status=2 表示最终完整结果已返回，可以结束
      if(xml && outer.data && String(outer.data.status) === '2'){
        finish(null, xml);
      }
    };

    ws.onerror = () => { finish(new Error('WebSocket 错误（检查网络 / 密钥 / 系统时间是否准）')); };
    ws.onclose = () => {
      if(!done){
        if(xml) finish(null, xml);
        else {
          const hint = lastServerMsg
            ? '；最后回包：' + lastServerMsg.slice(0,200)
            : '；服务端未返回任何消息即断开，常见原因：① 应用未开通「语音评测（流式版）」服务；② APIKey/APISecret 不是该服务的密钥；③ 账号无额度；④ 系统时间与讯飞差>5分钟。';
          finish(new Error('连接已关闭，未收到评测结果' + hint));
        }
      }
    };

    setTimeout(() => { finish(new Error('评测超时（60s）')); }, 60000);
  });
}

/* =======================================================================
   以下两个能力被「发音评测页」与「口语模考·朗读发音检测」共用，集中在此。
   ======================================================================= */

/* 共享 PCM 工具：拼接 Float32 块、线性重采样到 16k、转 Int16 */
function concatFloatChunks(chunks){
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

/* 麦克风直采 16k/16bit/单声道 PCM（方案A：AudioContext + ScriptProcessor + 零增益防回声）。
   返回控制器：ready(Promise，麦克风就绪) / stop()(→Promise<Int16Array>，已重采样16k) / cancel()(直接清理)。
   供发音评测页与模考朗读检测复用，避免各自复制录音逻辑。 */
function startPcmRecord(){
  let stream = null, ctx = null, processor = null, gain = null, chunks = null, stopped = false;
  const cleanup = () => {
    try{ if(processor){ processor.disconnect(); processor.onaudioprocess = null; } }catch(_){}
    try{ if(gain) gain.disconnect(); }catch(_){}
    try{ if(stream) stream.getTracks().forEach(t => t.stop()); }catch(_){}
    try{ if(ctx && ctx.state !== 'closed') ctx.close(); }catch(_){}
    stream = ctx = processor = gain = null;
  };
  const ready = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:1, echoCancellation:true, noiseSuppression:false, autoGainControl:false } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx({ sampleRate: 16000 });
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    gain = ctx.createGain(); gain.gain.value = 0; // 零增益，防回声
    chunks = [];
    processor.onaudioprocess = e => { const ch = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(ch)); };
    source.connect(processor); processor.connect(gain); gain.connect(ctx.destination);
  })();
  return {
    ready,
    async stop(){
      if(stopped) return new Int16Array(0);
      stopped = true;
      const fromRate = ctx ? ctx.sampleRate : 16000;
      cleanup();
      const floatAll = concatFloatChunks(chunks || []);
      if(!floatAll || floatAll.length < 1600) return new Int16Array(0); // <0.1s 视为没读
      const resampled = resampleFloat(floatAll, fromRate, 16000);
      return floatTo16(resampled);
    },
    cancel(){ stopped = true; cleanup(); }
  };
}

/* 解析讯飞评测 XML → 结构化结果（与发音评测页共用，避免重复解析逻辑） */
function parseIseXml(xml){
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
