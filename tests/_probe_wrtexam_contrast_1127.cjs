/* 写作模考题干对比度排查：复现「题干字看不清」 */
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const IS_LOCAL = /127\.0\.0\.1|localhost/.test(BASE);

const SEED = `try{
  localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings:{ theme:'light' }, words:[], sessions:[], plans:[], scores:[], speakingStories:[], errorbook:[], corpus:[], mockRecords:[] }));
  localStorage.setItem('hub_onboarding_v2', JSON.stringify({v:2,entered:true,finished:true,setup:{exam:true,effort:true,words:true},snoozed:true,exp:true,ts:Date.now()}));
}catch(e){}`;

async function run(theme, wtTheme) {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--mute-audio'].concat(IS_LOCAL ? [] : ['--proxy-server=direct://']) });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const init = SEED + `try{const d=JSON.parse(localStorage.getItem('ielts_study_hub_v1')||'{}');d.settings=d.settings||{};d.settings.theme='${theme}';localStorage.setItem('ielts_study_hub_v1',JSON.stringify(d));}catch(e){}`
    + `try{localStorage.setItem('ielts_wt_theme_v1','${wtTheme}');}catch(e){}`;
  await ctx.addInitScript({ content: init });
  const p = await ctx.newPage();
  await p.goto(BASE + (IS_LOCAL ? '/writing.html' : '/writing'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  const diag = await p.evaluate(() => ({
    panels: [...document.querySelectorAll('#tplPanel, #bankPanel, #scorePanel, #dictationPanel')].map(e => ({ id: e.id, hidden: e.hidden, visible: e.offsetParent !== null })),
    examItems: document.querySelectorAll('.exam-item').length,
    bigItems: document.querySelectorAll('.exam-item[data-kind="big"]').length,
    tplCards: document.querySelectorAll('.tpl-card').length,
  }));
  console.log('DIAG ' + JSON.stringify(diag));
  // 打开「完整写作模考」入口卡
  await p.evaluate(() => {
    const el = document.querySelector('#wrtFullStart');
    if (el) el.click();
  });
  await p.waitForTimeout(1500);
  // 若弹出计时选择框，点默认（确定）
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /开始|确定|OK|Start|开始模考|开始考试/.test(b.textContent || ''));
    if (btns.length) btns[btns.length - 1].click();
  });
  await p.waitForTimeout(1800);
  const entered = await p.evaluate(() => document.body.classList.contains('exam-fullscreen'));
  console.log('ENTERED ' + entered);
  await p.screenshot({ path: 'tests/shots-1127-wrt/contrast-' + theme + '-' + wtTheme + '.png' }).catch(() => {});
  const r = await p.evaluate(() => {
    const cs = e => e ? getComputedStyle(e) : null;
    const q = document.querySelector('#examQuestion');
    const lead = document.querySelector('.exam-q-lead');
    const note = document.querySelector('#examQNote');
    const instr = document.querySelector('#examInstr');
    const part = document.querySelector('#examPartLabel');
    const pr = document.querySelector('#examPractice');
    const examq = document.querySelector('#examPractice .exam-q');
    const wrap = document.querySelector('#examPractice .exam-q-body-wrap');
    return {
      fs: document.body.classList.contains('exam-fullscreen'),
      htmlTheme: document.documentElement.getAttribute('data-theme'),
      prClass: pr ? pr.className : null,
      prBg: cs(pr) ? cs(pr).backgroundColor : null,
      examqBg: cs(examq) ? cs(examq).backgroundColor : null,
      wrapBg: cs(wrap) ? cs(wrap).backgroundColor : null,
      lead: lead ? { color: cs(lead).color, bg: cs(lead).backgroundColor } : null,
      body: q ? { color: cs(q).color, bg: cs(q).backgroundColor, html: q.innerHTML.slice(0, 80) } : null,
      eiEn: q && q.querySelector('.ei-en') ? { color: cs(q.querySelector('.ei-en')).color } : null,
      note: note ? { color: cs(note).color, bg: cs(note).backgroundColor, txt: (note.textContent || '').slice(0, 30) } : null,
      instr: instr ? { color: cs(instr).color } : null,
      part: part ? { color: cs(part).color } : null,
    };
  });
  await b.close();
  return r;
}

(async () => {
  // 四组：浅/深站点 × 浅/深卷面，另加黄底档
  for (const combo of [['light', 'light'], ['dark', 'light'], ['dark', 'dark'], ['dark', 'yellow']]) {
    const [theme, wt] = combo;
    const r = await run(theme, wt);
    console.log('\n=== site=' + theme + ' wt=' + wt + ' ===');
    console.log(JSON.stringify(r, null, 2));
  }
})();
