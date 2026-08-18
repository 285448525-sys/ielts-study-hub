/* === 讯飞 IAT 语音听写（把说的话变成文字 / 转写）· 浏览器直连 WebSocket ===
   纯前端：HMAC-SHA256 签名 + wss 流式听写，无后端、无密钥泄漏风险（自用）。
   端点：wss://iat-api.xfyun.cn/v2/iat，英文 en_us。
   注意：crypto.subtle 需要安全上下文（HTTPS 或 localhost）；file:// 直开不可用。
   说明：本项目只用讯飞的「语音听写（IAT）」做口语录音转写；发音打分（ISE）已移除。
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

/* 构造握手 URL（带鉴权参数）。默认走 IAT（语音听写 / 转写）。 */
async function xfyunAuthUrl(cfg, host, path){
  host = host || 'iat-api.xfyun.cn';
  path = path || '/v2/iat';
  if(!window.crypto || !crypto.subtle){
    throw new Error('当前环境不支持加密（需 HTTPS 或 localhost，不能用 file:// 直开）');
  }
  const date = new Date().toUTCString(); // RFC1123 GMT，如 Wed, 10 Jul 2019 07:35:43 GMT
  const signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
  const signature = await hmacSha256Base64(signatureOrigin, cfg.apiSecret);
  const authorizationOrigin = 'api_key="' + cfg.apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
  const authorization = utf8ToBase64(authorizationOrigin);
  return 'wss://' + host + path
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



/* =======================================================================
   讯飞 IAT（语音听写 / 把说的话变成文字）· 浏览器直连 WebSocket
   端点：wss://iat-api.xfyun.cn/v2/iat，英文 en_us。
   复用本文件上方 xfyunAuthUrl 的握手逻辑，音频帧采用 IAT 格式（与已移除的发音评测无关）。
   ======================================================================= */
function xfyunIat(pcm, cfg){
  return new Promise(async (resolve, reject) => {
    let url;
    try{ url = await xfyunAuthUrl(cfg, 'iat-api.xfyun.cn', '/v2/iat'); }
    catch(e){ reject(new Error('签名失败：' + e.message)); return; }
    let ws;
    try{ ws = new WebSocket(url); }
    catch(e){ reject(new Error('无法建立连接：' + e.message)); return; }
    let text = ''; let done = false; let lastMsg = '';
    const finish = (err, val) => { if(done) return; done = true; try{ ws.close(); }catch(_){} if(err) reject(err); else resolve(val); };
    let state = 'ssb_sent';
    const sendAudioFrames = (pcm) => {
      const chunkSamples = 640; // 40ms @16k
      const sendChunk = (audio, status) => { if(ws.readyState !== WebSocket.OPEN) return; ws.send(JSON.stringify({ data:{ status, data: audio } })); };
      if(!pcm || pcm.length === 0){ try{ sendChunk('', 2); }catch(e){ finish(new Error('发送末帧失败：' + e.message)); } return; }
      const total = pcm.length; let sent = 0;
      const step = () => {
        if(done) return;
        const isFirst = (sent === 0); const end = Math.min(sent + chunkSamples, total); const isLast = (end === total);
        const slice = pcm.subarray(sent, end); const audio = int16ToBase64(slice);
        try{ if(isFirst && !isLast) sendChunk(audio, 1); else if(isLast) sendChunk(audio, 2); else sendChunk(audio, 1); }
        catch(e){ finish(new Error('发送音频失败：' + e.message)); return; }
        sent = end; if(sent < total) setTimeout(step, 40);
      };
      step();
    };
    ws.onopen = () => {
      try{
        ws.send(JSON.stringify({ common:{ app_id: cfg.appid }, business:{ language:'en_us', domain:'iat', accent:'mandarin', vad_eos:2000, dwa:'wpgs' }, data:{ status:0 } }));
      }catch(e){ finish(new Error('发送首帧失败：' + e.message)); return; }
    };
    ws.onmessage = (ev) => {
      let outer; try{ outer = JSON.parse(ev.data); }catch(_){ return; }
      lastMsg = ev.data;
      const code = outer.code;
      if(code !== undefined && String(code) !== '0'){ finish(new Error('讯飞错误 ' + code + '：' + (outer.message || '未知错误'))); return; }
      if(state === 'ssb_sent'){ state = 'audio'; sendAudioFrames(pcm); return; }
      if(state !== 'audio') return;
      const payload = (outer.data && typeof outer.data === 'object') ? outer.data.data : outer.data;
      if(typeof payload !== 'string' || !payload) return;
      let decoded; try{ decoded = atob(payload); }catch(_){ return; }
      let obj = null; try{ obj = JSON.parse(decoded); }catch(_){}
      if(obj){
        text = ''; // wpgs：每帧重算整句
        const rt = (obj.cn && obj.cn.st && obj.cn.st.rt) || [];
        (rt[0] ? rt[0].ws : []).forEach(w => { (w.cw || []).forEach(c => { if(c.w) text += c.w; }); });
      }
      if(outer.data && String(outer.data.status) === '2'){ finish(null, text.trim()); }
    };
    ws.onerror = () => { finish(new Error('WebSocket 错误（检查网络 / 密钥 / 系统时间是否准）')); };
    ws.onclose = () => {
      if(!done){
        if(text) finish(null, text.trim());
        else { const hint = lastMsg ? '；最后回包：' + lastMsg.slice(0,200) : '；讯飞未返回结果，常见原因：①应用未开通「语音听写」服务 ②密钥非该服务 ③额度/系统时间与讯飞差>5分钟'; finish(new Error('连接已关闭，未收到结果' + hint)); }
      }
    };
    setTimeout(() => { finish(new Error('识别超时（60s）')); }, 60000);
  });
}

/* WAV Blob → 16k/16bit/单声道 PCM（Int16Array）。
   recorder.js 的 encodeWav 已输出 16k/16bit/单声道 WAV，可直接跳 44 字节头取 Int16；
   否则兜底解码重采样（复用本文件已有的 resampleFloat / floatTo16）。 */
async function wavBlobToPcm16k(blob){
  const buf = await blob.arrayBuffer();
  if(buf.byteLength > 44){
    const dv = new DataView(buf);
    const isRiff = dv.getUint32(0, true) === 0x46464952;
    const isWave = dv.getUint32(8, true) === 0x45564157;
    const bits = dv.getUint16(34, true);
    const ch = dv.getUint16(22, true);
    const rate = dv.getUint32(24, true);
    if(isRiff && isWave && bits === 16 && ch === 1 && rate === 16000){
      return new Int16Array(buf, 44); // 视图，非拷贝（xfyunIat 内部会按帧复制）
    }
  }
  // 兜底：解码任意音频并重采样到 16k 单声道
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try{ audio = await ctx.decodeAudioData(buf.slice(0)); }
  finally{ try{ ctx.close(); }catch(_){} }
  const src = audio.getChannelData(0);
  const resampled = resampleFloat(src, audio.sampleRate, 16000);
  return floatTo16(resampled);
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

