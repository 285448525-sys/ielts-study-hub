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
    const finish = (err, val) => {
      if(done) return; done = true;
      try{ ws.close(); }catch(_){}
      if(err) reject(err); else resolve(val);
    };

    const sendAudioFrames = (pcm) => {
      const chunkSamples = 8000; // ~0.5s/帧
      let sent = 0, first = true;
      while(sent < pcm.length){
        const end = Math.min(sent + chunkSamples, pcm.length);
        const slice = pcm.subarray(sent, end);
        const audio = int16ToBase64(slice);
        const isLast = end >= pcm.length;
        try{
          ws.send(JSON.stringify({
            business: { cmd:'auw', aus: first ? 1 : 2, auf:'audio/L16;rate=16000' },
            data: { status: 1, cmd:'auw', audio, auf:'audio/L16;rate=16000', aue:'raw' }
          }));
        }catch(e){ finish(new Error('发送音频失败：' + e.message)); return; }
        first = false; sent = end;
      }
      // 末帧（status=2, aus=4）
      try{
        ws.send(JSON.stringify({
          business: { cmd:'auw', aus: 4, auf:'audio/L16;rate=16000' },
          data: { status: 2, cmd:'auw', audio:'', auf:'audio/L16;rate=16000', aue:'raw' }
        }));
      }catch(e){ finish(new Error('发送末帧失败：' + e.message)); }
    };

    ws.onopen = () => {
      try{
        ws.send(JSON.stringify({
          common: { app_id: cfg.appid },
          business: {
            cmd:'ise', auf:'audio/L16;rate=16000', aue:'raw', text_type:'utf8',
            res_type:'entirety', rst:'entirety', language:'en_us',
            category:'read_sentence', text: encodeURIComponent(refText)
          },
          data: { status: 0, cmd:'ssb', audio:'', auf:'audio/L16;rate=16000' }
        }));
      }catch(e){ finish(new Error('发送首帧失败：' + e.message)); return; }
      sendAudioFrames(pcm);
    };

    ws.onmessage = (ev) => {
      let outer;
      try{ outer = JSON.parse(ev.data); }catch(_){ return; }
      if(outer.code !== 0 && outer.code !== undefined){
        finish(new Error('讯飞错误 ' + outer.code + '：' + (outer.message || '未知错误')));
        return;
      }
      if(!outer.data) return;
      let decoded;
      try{ decoded = atob(outer.data); }catch(_){ return; }
      // 情况 A：decoded 是 JSON（含 status/data），官方嵌套格式
      try{
        const inner = JSON.parse(decoded);
        if(inner.code !== 0 && inner.code !== undefined){
          finish(new Error('讯飞错误 ' + inner.code + '：' + (inner.message || '未知错误')));
          return;
        }
        if(inner.status === 2){
          if(inner.data){ try{ xml = atob(inner.data); }catch(_){} }
          finish(null, xml);
          return;
        }
        return; // status 0/1：中间帧，忽略
      }catch(_){ /* 不是 JSON → 直接是 XML */ }
      // 情况 B：decoded 直接是 XML 文本
      if(decoded.trim().startsWith('<')){
        xml = decoded;
        finish(null, xml);
      }
      // 否则忽略（中间帧片段）
    };

    ws.onerror = () => { finish(new Error('WebSocket 错误（检查网络 / 密钥 / 系统时间是否准）')); };
    ws.onclose = () => {
      if(!done){
        if(xml) finish(null, xml);
        else finish(new Error('连接已关闭，未收到评测结果'));
      }
    };

    setTimeout(() => { finish(new Error('评测超时（60s）')); }, 60000);
  });
}
