/* === 录音器：MediaRecorder 采集 → 重采样 16k 单声道 → 编码 WAV ===
   彻底取代不稳定的 Web Speech 单句识别（一停顿就 onend）。录音靠 MediaRecorder
   连续采，不因停顿结束；时长由 captureAnswer 的计时器 / P2 自动停控制。
   挂全局：window.startRecorder / stopRecorder / isRecording / blobToBase64。 */

(function () {
  let active = null;          // { mr, stream, startTime, timer, done }
  let _ctx = null;

  function ensureCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function pickMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    if (!(window.MediaRecorder && MediaRecorder.isTypeSupported)) return '';
    for (let i = 0; i < cands.length; i++) {
      if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    }
    return '';
  }

  function encodeWav(blob, targetRate) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const arr = fr.result;
        ensureCtx().decodeAudioData(arr.slice(0)).then(function (audioBuffer) {
          const srcRate = audioBuffer.sampleRate;
          const src = audioBuffer.getChannelData(0);
          const ratio = srcRate / targetRate;
          const newLen = Math.max(1, Math.round(src.length / ratio));
          const out = new Float32Array(newLen);
          for (let i = 0; i < newLen; i++) out[i] = src[Math.floor(i * ratio)];
          const buffer = new ArrayBuffer(44 + out.length * 2);
          const view = new DataView(buffer);
          const ws = function (off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
          ws(0, 'RIFF'); view.setUint32(4, 36 + out.length * 2, true); ws(8, 'WAVE');
          ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
          view.setUint32(24, targetRate, true);
          view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true);
          view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, out.length * 2, true);
          let off = 44;
          for (let i = 0; i < out.length; i++) {
            let s = Math.max(-1, Math.min(1, out[i]));
            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
          }
          resolve(new Blob([buffer], { type: 'audio/wav' }));
        }).catch(function () { reject(new Error('解码音频失败')); });
      };
      fr.onerror = function () { reject(new Error('读取音频失败')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* 开始录音。返回 Promise，停录后 resolve({blob, duration})。
     opts.autoStopMs：>0 时到时自动停（P2 到 2 分钟）；P1 传 0 由用户手动停。 */
  window.startRecorder = function (opts) {
    opts = opts || {};
    if (active) return Promise.reject(new Error('已在录音'));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('浏览器不支持录音（需 getUserMedia）'));
    }
    return new Promise(function (resolve, reject) {
      const done = resolve;   // 捕获解析器：onstop 与 stopRecorder 都通过它收尾
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      }).then(function (stream) {
        const mime = pickMime();
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = [];
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          const dur = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
          const raw = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          // 尽量转 16k 单声道 WAV（供播放 + 腾讯云识别）；失败则退回原始格式
          encodeWav(raw, 16000).then(function (wav) {
            done({ blob: wav, duration: dur });
          }).catch(function () {
            done({ blob: raw, duration: dur });
          });
          active = null;
        };
        const startTime = Date.now();
        let timer = null;
        if (opts.autoStopMs && opts.autoStopMs > 0) {
          timer = setTimeout(function () { try { if (mr.state !== 'inactive') mr.stop(); } catch (_) {} }, opts.autoStopMs);
        }
        active = { mr: mr, stream: stream, startTime: startTime, timer: timer, done: done };
        mr.start();
      }).catch(function (err) { reject(err); });
    });
  };

  window.stopRecorder = function () {
    if (!active) return Promise.resolve(null);
    const a = active;
    if (a.timer) clearTimeout(a.timer);
    return new Promise(function (resolve) {
      // 包一层：onstop 通过 active.done 收尾时，既解析 startRecorder 的 promise，
      // 也解析本 stopRecorder 返回的 promise（二者拿到同一结果）
      const orig = a.done;
      a.done = function (v) { orig(v); resolve(v); };
      try { if (a.mr.state !== 'inactive') a.mr.stop(); } catch (_) { resolve(null); }
    });
  };

  window.isRecording = function () {
    return !!(active && active.mr && active.mr.state !== 'inactive');
  };

  window.blobToBase64 = function (blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () {
        const b64 = (r.result || '').split(',')[1] || '';
        resolve(b64);
      };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  };
})();
