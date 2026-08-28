/* 回顾页（合并页）：软导航时由 common.js 的 runPageScript('review') 调用。
   本页同时承载 scores（模考成绩）+ history（学习轨迹）两块，没有单一业务脚本，
   故在此重新执行这两个脚本，复用它们既有的 ready() 初始化（图表 / 热力图 / 录入等）。
   注意：review.html 的 <head> 已用 <script defer> 加载 scores.js + history.js，
   本文件只在「软导航」路径下被 eval（全页面加载时不会重复执行，无双重初始化）。 */
(async () => {
  const load = async (f) => {
    try {
      const r = await fetch('js/' + f, { cache: 'force-cache' });
      if (r.ok) window.eval(await r.text());
    } catch (e) { console.error('[review] 加载 ' + f + ' 失败', e); }
  };
  await load('scores.js');
  await load('history.js');
  // 口语整卷模考历史（mock-history.js 复用 MockReport.render）：全量加载已就绪，软导航时重新渲染
  await load('mock-history.js');
  const list = document.getElementById('mockHistoryList');
  if (list && window.MockHistory && typeof window.MockHistory.render === 'function') {
    window.MockHistory.render(list, { countEl: document.getElementById('mockHistCount') });
  }
  // 口语单题日常练习沉淀（Feature A）：加载并渲染回顾页新增 section
  await load('speaking-practice.js');
  if (typeof window.renderSpeakingPractice === 'function') window.renderSpeakingPractice();

  // 下次考试日期（回顾页快捷设置）：写入 DATA.settings.examDate，复用首页倒计时
  const ed = document.getElementById('reviewExamDate');
  if (ed) {
    ed.value = (DATA.settings && DATA.settings.examDate) || '';
    const cdEl = document.getElementById('examCountdownText');
    const renderCd = () => {
      if (!cdEl || typeof examCountdown !== 'function') return;
      const cd = examCountdown();
      cdEl.textContent = cd.hasExam ? ('距考试 ' + cd.label) : '未设置';
    };
    renderCd();
    const saveBtn = document.getElementById('saveExamDate');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      DATA.settings = DATA.settings || {};
      DATA.settings.examDate = ed.value;
      hubSave();
      renderCd();
      toast(ed.value ? ('已保存下次考试日期：' + ed.value) : '已清除考试日期');
    });
  }
})();
