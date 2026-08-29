// 注入受控测试词（全部 due），重载后练习页自动开练
const words = [
  { en:'pity', ipa:'ˈpɪti', pos:'n.', cn:'怜悯；同情；憾事', nextReview:'2020-01-01', level:0, box:0, errTotal:0, lastReview:null, known:false },
  { en:'loan', ipa:'ləʊn', pos:'n.', cn:'贷款；借出', nextReview:'2020-01-01', level:0, box:0, errTotal:0, lastReview:null, known:false },
  { en:'tone', ipa:'təʊn', pos:'n.', cn:'语气；音调；色调', nextReview:'2020-01-01', level:0, box:0, errTotal:0, lastReview:null, known:false },
  { en:'lush', ipa:'lʌʃ', pos:'adj.', cn:'茂盛的；豪华的', nextReview:'2020-01-01', level:0, box:0, errTotal:0, lastReview:null, known:false }
];
const payload = { words: words, settings:{}, sessions:{}, dailySession:null, deletedWords:[] };
localStorage.setItem('ielts_study_hub_v1', JSON.stringify(payload));
location.reload();
