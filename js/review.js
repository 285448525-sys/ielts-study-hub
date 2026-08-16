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
})();
