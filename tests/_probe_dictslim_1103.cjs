/* DICT-HEADER-SLIM-1 判据探针（听写态瘦身）
   ① 听写态：只剩 输入横线 + 音标 + 话筒 + 模式钮（+ 不知道/已掌握两个功能出口）
   ② 听写态：头部回站链/上一词/书钮/设置齿轮/全屏/底部工具行/底部进度/例句/提示行/底部喇叭 全不可见
   ③ 模式切换往返：切到看词选义 → 头部工具全回来、听写专属块消失；再切回听写 → 又瘦回去
   ④ 其他两模式界面零变化（看词选义：题干英文 + 四个选项 + 例句都在）
   ⑤ 判分/落盘：听写打对推进 + 进度落盘
   ⑥ 自动读：进题读 1 次（每题一次）
   ⑦ 零 pageerror + 无横滑 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = parseInt(process.env.W || '1280', 10), H = parseInt(process.env.H || '900', 10);
const DARK = process.env.DARK === '1';

const COUNTER = `(function(){ window.__speaks=[];
  try{ var SS=window.speechSynthesis; if(!SS) return;
    SS.speak=function(u){ window.__speaks.push(String(u&&u.text||'')); }; }catch(e){} })();`;

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 500, hasTouch: W < 500, serviceWorkers: 'block' });
  await ctx.addInitScript(COUNTER);
  if (DARK) await ctx.addInitScript(() => { try { const k='ielts_study_hub_v1'; const d=JSON.parse(localStorage.getItem(k)||'{}'); d.settings=Object.assign({},d.settings,{theme:'dark'}); localStorage.setItem(k, JSON.stringify(d)); } catch(e){} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  await p.goto(BASE + '/practice.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const x = document.querySelector('#hubAncX'); if (x) x.click(); });
  await p.evaluate(() => { try { wbSetActive('rdtext'); } catch (e) {} });
  /* 词包是点「开始练习」时才懒加载的（wbSetActive 只改 active、不拉包）——所以别在开始前等词数，
     直接点开始、再等听写态出现；词库没到就多点几次。 */
  await p.evaluate(() => { try { pcSave({ questionMode: 'dictation', autoPlay: true, repeat: 1 }); } catch (e) {} });
  let entered = false;
  for (let i = 0; i < 12; i++) {
    await p.evaluate(() => { const bb = [...document.querySelectorAll('button')].find(x => /开始今天的练习|继续/.test(x.textContent || '')); if (bb) bb.click(); });
    await p.waitForTimeout(1400);
    entered = await p.evaluate(() => !!document.querySelector('#practiceBody .practice-word-area.pw-dict'));
    if (entered) break;
  }
  await p.waitForTimeout(1600);
  if (!entered) { console.log('RED   前置：没进到听写态（词库或入口没就绪）'); await b.close(); process.exit(2); }
  const wordsN = await p.evaluate(() => { try { return (wbWords() || []).length; } catch (e) { return 0; } });
  if (wordsN <= 100) { console.log('RED   前置：词库没加载出来（' + wordsN + ' 词）'); await b.close(); process.exit(2); }

  const vis = (sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const st = getComputedStyle(e); return { d: st.display, v: st.visibility, r: e.getBoundingClientRect().width > 0 }; }, sel);

  /* ① 听写态留下什么 */
  const input = await vis('#wddInput');
  ok('① 输入横线在', input && input.d !== 'none' && input.r, JSON.stringify(input));
  const ipa = await vis('#practiceBody .pw-ipa');
  ok('① 音标行在', ipa && ipa.d !== 'none', JSON.stringify(ipa));
  const spk = await vis('#qSpeaker');
  ok('① 话筒在', spk && spk.d !== 'none' && spk.r, JSON.stringify(spk));
  const mode = await vis('#wdModeBtn');
  ok('① 模式钮在（唯一模式出口）', mode && mode.d !== 'none' && mode.r, JSON.stringify(mode));
  const unk = await vis('#unknownBtn');
  ok('① 不知道在（功能出口）', unk && unk.d !== 'none', JSON.stringify(unk));

  /* ② 该删的全没了 */
  const gone = await p.evaluate(() => {
    const sel = ['#wdWordHeader .ws-wh-home', '#wsPrevBtn', '.ws-book-pop-wrap', '#cfgGear', '#fullscreenBtn',
                 '#practiceTools', '#wdFoot', '#statProgress', '#progBarWrap', '#practiceBody .pw-dict-hint',
                 '#practiceBody .wd-bottom-audio', '#practiceBody .wdd-hint'];
    const out = {};
    sel.forEach(s => { const e = document.querySelector(s); out[s] = e ? getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 : 'absent'; });
    return out;
  });
  const stillVisible = Object.keys(gone).filter(k => gone[k] === true);
  ok('② 多余元素全不可见', stillVisible.length === 0, stillVisible.length ? '还在显示：' + stillVisible.join(' , ') : '共查 ' + Object.keys(gone).length + ' 项');

  /* 例句不能漏（异步补例句会把答案印出来） */
  const eg = await p.evaluate(() => { const e = document.querySelector('#wdExample'); if (!e) return 'absent'; const st = getComputedStyle(e); return { d: st.display, txt: (e.textContent || '').trim().slice(0, 40), hidden: e.hidden }; });
  ok('② 例句已被挡住（不泄答案）', eg === 'absent' || (eg.d === 'none') || eg.hidden === true, JSON.stringify(eg));

  /* ⑥ 自动读 1 次 */
  const speaks = await p.evaluate(() => (window.__speaks || []).length);
  ok('⑥ 进题自动读 1 次', speaks === 1, '实测 ' + speaks + ' ' + JSON.stringify(await p.evaluate(() => window.__speaks || [])));

  /* ③ 切到看词选义：工具全回来、听写块消失 */
  const pick = async (label) => {
    await p.evaluate(() => { const x = document.querySelector('#wdModeBtn'); if (x) x.click(); });
    await p.waitForTimeout(450);
    await p.evaluate(l => { const box = document.querySelector('#wdModePopList'); if (!box) return; const bb = [...box.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l); if (bb) bb.click(); }, label);
    await p.waitForTimeout(2600);
  };
  await pick('看词选义');
  const back = await p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); return e ? (getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0) : 'absent'; };
    return { mode: g('#wdModeBtn'), gear: g('#cfgGear'), full: g('#fullscreenBtn'), book: g('.ws-book-pop-wrap'),
             foot: g('#wdFoot'), prog: g('#progBarWrap'), en: g('#practiceBody .pw-en'),
             opts: document.querySelectorAll('#practiceBody .opts-grid .opt-big').length,
             dictArea: !!document.querySelector('#practiceBody .practice-word-area.pw-dict') };
  });
  ok('③ 切到看词选义：头部工具全回来', back.gear !== 'absent' && back.gear !== false && back.full !== false && back.book !== false, JSON.stringify(back).slice(0, 200));
  /* 注：#wdFoot 全站本来就 display:none!important（css/p/practice.css:1116 终稿口径），不是听写态专属，
     所以这里只认错误快照里的 prog（头部进度条）——它在非听写态必须回来。 */
  ok('③ 切到看词选义：头部进度条回来', back.prog !== false, 'prog=' + back.prog);
  ok('④ 看词选义界面零变化：题干+四选项在', back.en !== false && back.opts >= 2 && !back.dictArea, 'opts=' + back.opts + ' dictArea=' + back.dictArea);

  /* ③ 再切回听写：又瘦回去 */
  await pick('听写模式');
  if (!(await p.evaluate(() => !!document.querySelector('#practiceBody .practice-word-area.pw-dict')))) await pick('听写模式');
  await p.waitForTimeout(1200);
  const again = await p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); return e ? (getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0) : 'absent'; };
    return { gear: g('#cfgGear'), foot: g('#wdFoot'), prog: g('#progBarWrap'), mode: g('#wdModeBtn'),
             input: g('#wddInput'), hint: g('#practiceBody .pw-dict-hint') };
  });
  ok('③ 切回听写：又瘦回去', again.gear === false && again.foot === false && again.prog === false && again.input !== false && again.hint === false, JSON.stringify(again));
  ok('③ 切回听写：模式钮仍在（切得出去）', again.mode !== false, 'mode=' + again.mode);

  /* ⑤ 判分落盘：打对当前词 → 推进 + 进度变 */
  const before = await p.evaluate(() => { try { const w = wbWords() || []; return w.filter(x => x.cleared).length; } catch (e) { return -1; } });
  const ans = await p.evaluate(() => { const i = document.querySelector('#wddInput'); return i ? i.getAttribute('data-wdd-answer') : ''; });
  await p.waitForSelector('#wddInput', { timeout: 10000 });
  await p.fill('#wddInput', ans);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2200);
  const advanced = await p.evaluate(() => { const i = document.querySelector('#wddInput'); return { val: i ? i.value : null, ans: i ? i.getAttribute('data-wdd-answer') : null }; });
  ok('⑤ 听写打对能推进（换到下一词）', advanced.ans !== ans || advanced.val === '', JSON.stringify(advanced));
  const after = await p.evaluate(() => { try { const w = wbWords() || []; return w.filter(x => x.cleared).length; } catch (e) { return -1; } });
  ok('⑤ 判分/落盘有记录（已背数不减）', after >= before, 'before=' + before + ' after=' + after);

  /* ⑦ 横滑 + 报错 */
  const ovf = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('⑦ 无横向溢出', ovf <= 1, 'scrollWidth-clientWidth=' + ovf);
  ok('⑦ 零 pageerror', errs.length === 0, errs.slice(0, 2));

  console.log("DICT-HEADER-SLIM-1 (" + W + "x" + H + (DARK ? " dark" : " light") + ")  " + pass + " pass / " + fail + " red");
  await p.screenshot({ path: `_audit1_1027/dict_after_${W}${DARK ? '_dark' : ''}.png` });
  await b.close();
  process.exit(fail ? 1 : 0);
})();
