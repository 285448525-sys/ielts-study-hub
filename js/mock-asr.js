/* 口语模考 · 耳朵层：浏览器本地语音转写（Web Speech API）
   - 仅出文字，不做发音评测（发音分来自用户设置）。
   - 仅 Chrome / Edge 等基于 Chromium 的浏览器支持；不支持时 MockASR.supported=false，
     mock.js 会退化为「手动粘贴文本」流程。
   - 以 IIFE 暴露为 window.MockASR，避免与软导航重复 eval 时的命名冲突。 */
(function(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  let rec = null;
  let finalText = '';
  let interimText = '';
  let onText = null;

  function start(handlers){
    handlers = handlers || {};
    onText = handlers.onText;
    if(!supported){ if(handlers.onError) handlers.onError('unsupported'); return { supported:false }; }
    try{
      rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      finalText = '';
      interimText = '';
      rec.onresult = (e) => {
        interimText = '';
        for(let i = e.resultIndex; i < e.results.length; i++){
          const t = e.results[i][0].transcript;
          if(e.results[i].isFinal) finalText += t + ' ';
          else interimText += t;
        }
        if(onText) onText((finalText + interimText).trim(), { final:finalText.trim(), interim:interimText.trim() });
      };
      rec.onerror = (e) => { if(handlers.onError) handlers.onError(e && e.error ? e.error : 'error'); };
      // Chromium 会在静音一会儿后自动 onend，这里自动重启以保持连续识别
      rec.onend = () => { if(rec && rec._running){ try{ rec.start(); }catch(_){} } };
      rec._running = true;
      rec.start();
      return { supported:true };
    }catch(err){
      return { supported:false, error:String(err) };
    }
  }

  function stop(){
    const text = (finalText + interimText).trim();
    if(rec){
      rec._running = false;
      try{ rec.stop(); }catch(_){}
      rec = null;
    }
    return { transcript:text, supported };
  }

  // 强制停止（页面切换 / 超时兜底），不返回文本也不触发回调
  function abort(){
    if(rec){ rec._running = false; try{ rec.stop(); }catch(_){} rec = null; }
  }

  window.MockASR = { supported, start, stop, abort, isSupported:() => supported };
})();
