/* js/wd-dict.js — 单词听写打字层（WD-DICT-TYPE-1 · 11-01 她口令）
   需求原话：「现在要做那个新的听写模式…把我这个网站里面简化的功能加到这个听写模式就行」
   + 参考 C:/Users/Camille/Desktop/雅思/sentence-typing（她自己的句子打字站）的打字反馈音效。
   ── 形态 ──
   听发音（进题自动播一次，喇叭可重播）→ 键盘打出单词 →
   · 逐键打字音（sfx/bubble/*.wav，与句子打字站同一套素材：普通键轮换、空格/回车/退格走指定索引、60ms 节流）
   · 判定：输入长度 ≥ 词长即判（Enter 也可提前判）
     对 → sfx/correct.mp3 → judge(cur, en, true)
     错 → sfx/error.mp3  → judge(cur, en, false)（judge 原链路揭示正确拼写/释义/SRS/短线重复，一行不改）
   · 打字过程中题干隐藏逻辑沿用 .pw-audio/.pw-dict 那套 CSS，无新增壳。
   🔴 判题/SRS/统计/进度 全走既有 judge()，本文件只做「输入 + 音效 + 触发 judge」。
   顶层零 const/let 导出污染：全部挂 window.WD_DICT（PRECORE 无顶层 const 纪律）。 */
(function(){
  'use strict';
  if (window.WD_DICT) return;                       // 软导航重复 eval 幂等

  /* 打字音效表：素材与句子打字站 KEY_SOUNDS 同源（tables.js:217） */
  var KEY_SOUNDS = {
    bubble:     { files: ['sfx/bubble/1.wav','sfx/bubble/2.wav','sfx/bubble/3.wav','sfx/bubble/4.wav',
                          'sfx/bubble/5.wav','sfx/bubble/6.wav','sfx/bubble/7.wav','sfx/bubble/8.wav','sfx/bubble/enter.mp3'],
                  normalKeyCount: 8, keyTypeMap: { enter: 8, space: 5, backspace: 6 } },
    mechanical: { files: ['sfx/mechanical/1.wav','sfx/mechanical/2.wav','sfx/mechanical/3.wav','sfx/mechanical/4.wav','sfx/mechanical/5.wav'],
                  normalKeyCount: 4, keyTypeMap: { enter: 4 } },
    default:    { files: ['sfx/keys/default.mp3'], normalKeyCount: 1, keyTypeMap: {} }
  };
  var KEY_VOL_DEF = { default: 100, mechanical: 60, bubble: 70 };

  var pool = {};                                    // 每类音效各自的 Audio 池
  function keyAudio(type){
    if(!pool[type]) pool[type] = KEY_SOUNDS[type].files.map(function(f){
      var a = new Audio(f); a.preload = 'auto'; return a;
    });
    return pool[type];
  }
  var lastClick = 0;
  /* 只在这些键上响（与句子站 keyIsTyping 同口径） */
  function keyIsTyping(k){
    return k.indexOf('Ctrl') < 0 && k.indexOf('Alt') < 0 &&
      (/^[a-z0-9]$/i.test(k) || ['Backspace',' ','\'','Enter','-'].indexOf(k) >= 0);
  }
  /* 逐键音：60ms 连按节流；Enter/Space/Backspace 走 keyTypeMap 指定索引 */
  function keyClick(rawKey, type){
    if(!keyIsTyping(rawKey)) return;
    var t = KEY_SOUNDS[type] ? type : 'default';
    var now = performance.now();
    if(now - lastClick < 60) return;
    lastClick = now;
    var vol = KEY_VOL_DEF[t] / 100;
    try{
      var table = KEY_SOUNDS[t];
      var mapped = (rawKey === 'Enter') ? table.keyTypeMap.enter
        : (rawKey === ' ') ? table.keyTypeMap.space
        : (rawKey === 'Backspace') ? table.keyTypeMap.backspace : undefined;
      var idx = (mapped != null) ? mapped : Math.floor(now / 60) % table.normalKeyCount;
      var a = keyAudio(t)[idx] || keyAudio(t)[0];
      if(a){ a.volume = vol; a.currentTime = 0; a.play().catch(function(){}); }
    }catch(e){}
  }
  var fbPool = {};
  function fb(file){
    try{
      if(!fbPool[file]){ var a = new Audio(file); a.preload = 'auto'; fbPool[file] = a; }
      fbPool[file].volume = 0.9; fbPool[file].currentTime = 0;
      fbPool[file].play().catch(function(){});
    }catch(e){}
  }

  /* ---------- 听写输入框挂载（practice.js 渲染完听写题后调用） ---------- */
  var BOUND = null;                                 // 防重复绑定
  function mount(cur){
    var host = document.getElementById('opts');
    if(!host || !cur) return;
    var answer = String(cur.en || '');
    host.innerHTML =
      '<div class="wdd-wrap">' +
        '<input id="wddInput" class="wdd-input" type="text" autocomplete="off" autocapitalize="off" ' +
          'spellcheck="false" inputmode="text" placeholder="打出你听到的单词…" ' +
          'aria-label="听写输入框" data-wdd-answer="' + answer.replace(/"/g,'&quot;') + '">' +
        '<div class="wdd-hint">听发音，打出单词 · 回车提交</div>' +
      '</div>';
    var input = document.getElementById('wddInput');
    var type = 'bubble';                            // 默认 bubble 音色（与句子站 default 同级，柔和）
    try{
      var saved = localStorage.getItem('ielts_study_hub_v1');
      // 打字音色偏好存站点独立键，不进 DATA（轻量、不参与云同步）
      type = localStorage.getItem('wdd_key_sound') || 'bubble';
      if(!KEY_SOUNDS[type]) type = 'bubble';
    }catch(e){}
    if(BOUND){ BOUND.remove && BOUND.remove(); }
    function judgeNow(silent){
      var val = input.value.trim();
      if(!val) return;
      var ok = val.toLowerCase() === answer.toLowerCase();
      fb(ok ? 'sfx/correct.mp3' : 'sfx/error.mp3');
      try{
        // 走既有 judge：pickedEn=输入值（答错时 wrongList.user 记录入值），correct=true/false
        if(typeof window.__wdJudge === 'function') window.__wdJudge(cur, val, ok, false);
      }catch(e){}
    }
    input.addEventListener('keydown', function(e){
      var k = e.key;
      if(k === 'Enter'){ e.preventDefault(); keyClick('Enter', type); judgeNow(); return; }
      if(k === 'Backspace'){ keyClick('Backspace', type); return; }
      if(k === ' '){ keyClick(' ', type); return; }   // 词组里允许空格，音效照响
      keyClick(k, type);
      // 打满词长即自动判（回车也可）——但退格中的瞬时长度不判
    });
    input.addEventListener('input', function(){
      var v = input.value;
      // 长度达词长且无空格词组差异时自动判：只在「输入长度 >= 答案长度」时触发
      if(v.length >= answer.length){ setTimeout(function(){ if(!input.value) return; judgeNow(); }, 0); }
    });
    setTimeout(function(){ try{ input.focus({ preventScroll: true }); }catch(e){ input.focus(); } }, 60);
    BOUND = input;
  }

  window.WD_DICT = { mount: mount, keyClick: keyClick, fb: fb, KEY_SOUNDS: KEY_SOUNDS };
})();
