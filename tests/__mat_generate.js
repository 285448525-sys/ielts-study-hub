/* 模拟回归：重新生成 = 整库替换 + 追问收敛
   场景：库里已有 11 张旧卡（2 张置顶、3 张手改），点「重新生成」→
   1) 旧卡全部不留，materials = AI 新返回的 3 张
   2) 新卡 coverage 题名纠偏（变体落回题库题名、幻觉题名丢弃）
   3) gaps 只留真缺题；AI followups 有缺题时才保留且上限 4 条 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, failCnt = 0;
function ok(cond, name, extra){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { failCnt++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'materials.html'), 'utf8')
    .replace(/<script defer src="js\/[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/materials.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window){
      // 11 张旧卡（含置顶/手改标记）+ 完整问卷答案 + 旧追问
      const old = [];
      for(let i = 0; i < 11; i++){
        old.push({ id: 'old' + i, title: '旧卡' + i, storyEn: 'old story ' + i, logicZh: '旧', coverage: [], pinned: i < 2, updatedAt: (i >= 2 && i < 5) ? 123 : undefined });
      }
      const store = {
        persona: { city: '杭州', identity: '大三学生', values: [], traits: [] },
        materials: old,
        answers: { A: '杭州大三计算机学生', B1: '和男朋友去厦门玩了三天，看了日落', B2: '做雅思学习网站', B3: '帮朋友搬家', B4: '考研网站', B5: '听歌放松' },
        followups: ['旧追问1', '旧追问2'], gaps: [{ topic: '旧缺题', question: '旧缺题？' }],
        uncovered: [], bankVersion: 'v5'
      };
      window.localStorage.setItem('ielts_materials_v1', JSON.stringify(store));
      // jsdom 未实现 scrollIntoView（软门槛提示用）
      window.Element.prototype.scrollIntoView = function(){};
    }
  });

  const { window } = dom;
  const code = ['js/data.js', 'js/common.js', 'js/materials.js']
    .map(f => '// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  try{ window.eval(code); }
  catch(e){ console.error('EVAL_FAIL', e.message); process.exit(2); }
  await new Promise(r => setTimeout(r, 200));

  const doc = window.document;
  const calls = [];
  window.callRelay = async function(service, messages, temperature){
    calls.push(service);
    if(service === 'material_persona'){
      return JSON.stringify({ persona: { city: '杭州', identity: '大三学生', values: [], traits: [] } });
    }
    if(service === 'material'){
      return JSON.stringify({ stories: [
        { title: '厦门看日落', storyEn: 'Last month I went to Xiamen with my boyfriend. We watched the sunset from our tall hotel. It was beautiful and relaxing.', logicZh: '厦门—日落—高楼—平静', coverage: [
          { topic: '推荐旅行过的地方', fit: 'natural', bridgeEn: 'I went to Xiamen.', note: '' },
          { topic: '喜欢或不喜欢的高建筑', fit: 'natural', bridgeEn: 'Our hotel was tall.', note: '' },
          { topic: '想颁布的环保法律', fit: 'loose', bridgeEn: 'I want a law to protect the environment.', note: '变体→想要颁布的环保法律' },
          { topic: '想颁布的网络隐私法', fit: 'loose', bridgeEn: '', note: '幻觉→丢弃' }
        ] },
        { title: '做网站', storyEn: 'I built two study websites by myself. It was amazing.', logicZh: '建站—成就感', coverage: [
          { topic: '机智解决问题的人', fit: 'natural', bridgeEn: 'I solved problems.', note: '' }
        ] },
        { title: '听歌', storyEn: 'I listen to a song called Shi Yi. It makes me calm.', logicZh: '听歌—平静', coverage: [
          { topic: '保护环境的法律', fit: 'loose', bridgeEn: '', note: '' }
        ] }
      ], uncovered: [], followups: ['追1', '追2', '追3', '追4', '追5'] });
    }
    if(service === 'material_gap'){
      // 故意给一个真缺题 + 一个已被覆盖的题 → 覆盖的应被过滤
      return JSON.stringify([
        { topic: '包含动物的故事或书', question: '你喜欢什么动物故事？' },
        { topic: '机智解决问题的人', question: '这个题已被覆盖，应被过滤' }
      ]);
    }
    throw new Error('unexpected service ' + service);
  };

  const before = JSON.parse(window.localStorage.getItem('ielts_materials_v1'));
  ok(before.materials.length === 11, '生成前库里有 11 张旧卡');

  const regenBtn = doc.querySelector('[data-regen-all]');
  ok(!!regenBtn, '结果页「重新生成」按钮存在');
  regenBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  // 短答案软门槛：出现「直接生成」就点它放行（与真实用户路径一致）
  const shortGen = doc.querySelector('#matShortGen');
  if(shortGen) shortGen.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1500));

  const hubRaw = JSON.parse(window.localStorage.getItem('ielts_study_hub_v1') || '{}');
  const saved = (hubRaw.materials && hubRaw.materials.materials) ? hubRaw.materials : JSON.parse(window.localStorage.getItem('ielts_materials_v1'));

  ok(calls.includes('material') && calls.includes('material_gap') && calls.includes('material_persona'), '三段 AI 调用齐全（人设/素材/缺口）');
  ok(saved.materials.length === 3, '整库替换：重新生成后只剩新 3 张（旧 11 张不留）', '实际 ' + saved.materials.length);
  ok(!saved.materials.some(m => (m.title || '').indexOf('旧卡') === 0), '置顶/手改的旧卡也不再保留（整库替换）');

  const cov1 = saved.materials[0].coverage.map(c => c.topic);
  ok(cov1.includes('想要颁布的环保法律'), '生成路径同样做题名纠偏（变体→题库题名）');
  ok(!cov1.includes('想颁布的网络隐私法'), '幻觉题名在生成路径同样被丢弃');

  const gapTopics = (saved.gaps || []).map(g => g.topic);
  ok(gapTopics.length === 1 && gapTopics[0] === '包含动物的故事或书', 'gaps 只留真缺题（已被覆盖的「机智解决问题的人」被过滤）', '实际 ' + JSON.stringify(gapTopics));
  ok((saved.followups || []).length === 4 && (saved.followups || []).every(f => ['追1','追2','追3','追4'].includes(f)), '有缺题时 followups 保留且上限 4 条（AI 给 5 条裁到 4）');
  ok(!(saved.followups || []).includes('旧追问1') && !(saved.gaps || []).some(g => g.topic === '旧缺题'), '旧追问不残留');

  ok(calls.filter(s => s === 'material').length === 1, '素材生成只调 1 次（不会重复叠加生成）');

  console.log('\n==== 结果: ' + pass + ' PASS / ' + failCnt + ' FAIL ====');
  process.exit(failCnt ? 1 : 0);
})().catch(e => { console.error('HARNESS_ERROR', e && (e.stack || e.message || e)); process.exit(2); });
