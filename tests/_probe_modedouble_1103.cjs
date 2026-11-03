/* MODE-DOUBLE-READ-1 判据探针：自动朗读去重后，各路径朗读次数是否符合预期。
   ① 进场 1 次  ② 切走 1 次  ③ 切回 1 次  ④ 同一词连续重渲染 2 次 → 只读 1 次
   ⑤ 点喇叭 1 次  ⑥ 连点喇叭 2 次 → 读 2 次（手动不去重，行为不变）  ⑦ 下一题 1 次
   全程静音（--mute-audio + 把 speak 换成计数器）。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = parseInt(process.env.W || '1280', 10), H = parseInt(process.env.H || '900', 10);

const COUNTER = `
(function(){ window.__speaks=[];
  try{ var SS=window.speechSynthesis; if(!SS) return;
    SS.speak=function(u){ window.__speaks.push({t:Date.now(), text:String(u&&u.text||'')}); };
  }catch(e){}
})();`;

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 500, hasTouch: W < 500, serviceWorkers: 'block' });
  await ctx.addInitScript(COUNTER);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  const count = () => p.evaluate(() => (window.__speaks || []).length);
  const tail = async (n) => (await p.evaluate(() => window.__speaks || [])).slice(n).map(x => x.text);

  await p.goto(BASE + '/practice.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const x = document.querySelector('#hubAncX'); if (x) x.click(); });
  await p.evaluate(() => { try { wbSetActive('rdtext'); } catch (e) {} });
  for (let i = 0; i < 15; i++) { await p.waitForTimeout(700); if (await p.evaluate(() => { try { return (wbWords() || []).length > 100; } catch (e) { return false; } })) break; }
  await p.evaluate(() => { try { pcSave({ questionMode: 'audio', autoPlay: true, repeat: 1 }); } catch (e) {} });
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__speaks = []; });
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /开始今天的练习|继续/.test(x.textContent || '')); if (b) b.click(); });
  await p.waitForTimeout(2600);

  const word0 = await p.evaluate(() => (document.querySelector('#practiceBody .pw-en-tx') || {}).textContent);
  ok('① 进场自动读 1 次', (await count()) === 1, 'word=' + word0 + ' speaks=' + JSON.stringify(await tail(0)));

  async function pick(label) {
    await p.evaluate(() => { const x = document.querySelector('#wdModeBtn'); if (x) x.click(); });
    await p.waitForTimeout(450);
    await p.evaluate(l => { const box = document.querySelector('#wdModePopList'); if (!box) return; const b = [...box.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (b) b.click(); }, label);
    await p.waitForTimeout(3000);
  }

  let n = await count();
  await pick('看词选义');
  ok('② 切到看词选义：再读 1 次', (await count()) - n === 1, JSON.stringify(await tail(n)));

  n = await count();
  await pick('听音选义');
  const addMode = (await count()) - n;
  ok('③ 切回听音选义：只读 1 次（原 bug 点）', addMode === 1, '实测 ' + addMode + ' 次 ' + JSON.stringify(await tail(n)));

  /* ④ 同一词连续重渲染两次：应只读 1 次 */
  n = await count();
  await p.evaluate(() => { const cur = pq && pq.queue && pq.queue[pq.idx]; if (cur && typeof renderQuestion === 'function') { renderQuestion(cur); renderQuestion(cur); } });
  await p.waitForTimeout(1800);
  const addRender = (await count()) - n;
  ok('④ 同一词连渲染 2 次：只读 1 次（去重生效）', addRender === 1, '实测 ' + addRender);

  /* ⑤ 点喇叭 1 次 */
  n = await count();
  await p.evaluate(() => { const q = document.getElementById('qSpeaker'); if (q) q.click(); });
  await p.waitForTimeout(1500);
  ok('⑤ 点喇叭重播：1 次', (await count()) - n === 1, String((await count()) - n));

  /* ⑥ 连点喇叭 2 次：手动不去重，应读 2 次 */
  n = await count();
  await p.evaluate(() => { const q = document.getElementById('qSpeaker'); if (q) { q.click(); q.click(); } });
  await p.waitForTimeout(1800);
  const addManual = (await count()) - n;
  ok('⑥ 连点喇叭 2 次：读 2 次（手动不被去重，行为不变）', addManual === 2, '实测 ' + addManual);

  /* ⑦ 不知道 → 下一题：1 次 */
  n = await count();
  await p.evaluate(() => { const q = document.getElementById('unknownBtn'); if (q) q.click(); });
  await p.waitForTimeout(3400);
  const addNext = (await count()) - n;
  ok('⑦ 下一题：1 次', addNext === 1, '实测 ' + addNext);

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2));
  console.log('\n=== MODE-DOUBLE-READ-1 (' + W + 'x' + H + ')：' + pass + ' 过 / ' + fail + ' 红 ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
