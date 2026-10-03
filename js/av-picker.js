/* ============================================================
   10/3 头像选择（A窗口实现，她拍板：open-peeps 男4女4 = 用户可选，avataaars F/M = 考官可选）
   —— 素材来源：DiceBear（https://www.dicebear.com/styles/）
      · open-peeps（Pablo Stanley, CC0 1.0）= 用户 8 个
      · avataaars（Pablo Stanley, CC0 1.0）= 考官 2 个
      两者均免署名可商用，SVG 已剥掉 <metadata> RDF 块，落在 img/avatars/。
   —— **只存文件名**（DATA.settings.avatar / examAvatar），云同步只带几十字节，不存图片本身
   —— 字段已登记 SYNC_SETTINGS_FIELDS（common.js），保存自打 _fieldTs
   —— 暴露 window.avUser() / window.avExam() 供其他页（陪练气泡、模考考官）取 src
   ============================================================ */
(function(){
  'use strict';

  /* 用户可选 8 个（open-peeps）：女 4 + 男 4 */
  var USER_AVATARS = [
    { f: 'user-f1', label: '女生 1' },
    { f: 'user-f2', label: '女生 2' },
    { f: 'user-f3', label: '女生 3' },
    { f: 'user-f4', label: '女生 4' },
    { f: 'user-m1', label: '男生 1' },
    { f: 'user-m2', label: '男生 2' },
    { f: 'user-m3', label: '男生 3' },
    { f: 'user-m4', label: '男生 4' }
  ];
  /* 考官 2 个（avataaars，更精细的 Q 版） */
  var EXAM_AVATARS = [
    { f: 'exam-f', label: '考官 1' },
    { f: 'exam-m', label: '考官 2' }
  ];
  var DIR = 'img/avatars/';
  var FALLBACK_USER = 'user-f1';
  var FALLBACK_EXAM = 'exam-f';

  function valid(list, f){
    if(!f) return false;
    return list.some(function(x){ return x.f === f; });
  }
  function cur(){ return (DATA && DATA.settings) || {}; }

  /** 当前用户头像文件名（无设置/非法值 → 默认第一个） */
  function avUser(){
    var f = cur().avatar;
    return valid(USER_AVATARS, f) ? f : FALLBACK_USER;
  }
  /** 当前考官头像文件名 */
  function avExam(){
    var f = cur().examAvatar;
    return valid(EXAM_AVATARS, f) ? f : FALLBACK_EXAM;
  }
  function userSrc(){ return DIR + avUser() + '.svg'; }
  function examSrc(){ return DIR + avExam() + '.svg'; }

  function save(field, f){
    if(!DATA.settings) return;
    DATA.settings[field] = f;
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs[field] = Date.now();
    if(typeof hubSave === 'function') hubSave();
  }

  function renderGrid(boxId, list, curFn, field){
    var box = document.getElementById(boxId);
    if(!box) return;
    box.innerHTML = list.map(function(a){
      var on = (curFn() === a.f) ? ' on' : '';
      return '<button type="button" class="av-opt' + on + '" data-av="' + a.f + '" role="radio"'
        + ' aria-checked="' + (curFn() === a.f ? 'true' : 'false') + '" title="' + a.label + '">'
        + '<span class="av-box"><img src="' + DIR + a.f + '.svg" alt="' + a.label + '" loading="lazy"'
        + ' onerror="this.style.visibility=\'hidden\'"></span>'
        + '<span class="av-lb">' + a.label + '</span></button>';
    }).join('');
    box.onclick = function(e){
      var b = e.target.closest ? e.target.closest('.av-opt') : null;
      if(!b) return;
      var f = b.getAttribute('data-av');
      if(!f) return;
      save(field, f);
      // 本页重渲染选中态 + 顶部账户卡 + 侧栏头像
      renderAll();
      syncAccountCard();
      syncSide();
    };
  }

  function renderAll(){
    renderGrid('avUserGrid', USER_AVATARS, avUser, 'avatar');
    renderGrid('avExamGrid', EXAM_AVATARS, avExam, 'examAvatar');
  }

  /** 顶部账户卡（52px）跟随选择 */
  function syncAccountCard(){
    var img = document.getElementById('acctAvatarImg');
    if(img){
      var want = userSrc();
      if(img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }
  /* 侧栏头像：common.js 注入的是静态 HTML（injectNav 只在首次 ready 跑一次），
     选完头像必须手动换 src，否则要刷新页面才生效。 */
  function syncSide(){
    var img = document.querySelector('.side-me img');
    if(img){
      var want = userSrc();
      if(img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }

  /* 挂到 window：陪练气泡（coach.js）、模考考官（mock.js）都从这里取 */
  window.avUser = avUser;
  window.avExam = avExam;
  window.avUserSrc = userSrc;
  window.avExamSrc = examSrc;
  window.avSyncAccountCard = syncAccountCard;
  window.avSyncSide = syncSide;

  /* 设置页 ready 后渲染一次；其它页只做账户卡同步（若页面上有这个元素） */
  function boot(){
    var box = document.getElementById('avatarCard');
    if(box){ renderAll(); }
    syncAccountCard();
    syncSide();
  }
  if(typeof ready === 'function') ready(boot);
  else if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
